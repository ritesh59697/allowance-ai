// Reads leash state over RPC and submits owner actions.
//
// Owner actions are signed by a "relay key": an ed25519 function-call key,
// generated on this device, that may only call the passkey-gated methods.
// Leaking it lets someone burn its small gas allowance, nothing more: every
// one of those methods still needs a fresh Face ID signature.
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, type KeyPairString } from 'near-api-js'
import { load, save } from './storage'
import type { WebAuthnAssertion } from './webauthn'

function env(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) throw new Error(`Missing ${name} (see web/.env.example)`)
  return value
}

export const config = {
  network: env('VITE_NEAR_NETWORK'),
  rpcUrl: env('VITE_NEAR_RPC_URL'),
  explorerTxUrl: env('VITE_NEAR_EXPLORER_TX_URL'),
  explorerAccountUrl: env('VITE_NEAR_EXPLORER_ACCOUNT_URL'),
  defaultLeashAccount: (import.meta.env.VITE_LEASH_ACCOUNT as string | undefined) ?? '',
  /** Public source repository; links to it are hidden when unset. */
  repoUrl: ((import.meta.env.VITE_REPO_URL as string | undefined) ?? '').replace(/\/$/, ''),
  rpId: (import.meta.env.VITE_PASSKEY_RP_ID as string | undefined) || window.location.hostname,
  pollMs: Number(env('VITE_POLL_MS')),
  callGas: BigInt(env('VITE_GAS_CALL_TGAS')) * 10n ** 12n,
  /** Arena server: the arena API and the owner-action relay. Same origin when empty. */
  apiUrl: (import.meta.env.VITE_ARENA_API_URL as string | undefined) ?? '',
}

export const OWNER_METHODS = ['approve', 'reject', 'reject_all', 'set_policy', 'withdraw', 'add_agent_key', 'revoke_agent_key']

const provider = new JsonRpcProvider({ url: config.rpcUrl })

// ------------------------------------------------------------------ types

export type Policy = {
  per_tx_max: string
  window_max: string
  window_secs: number
  max_pending: number
  max_memo_bytes: number
  allowed_receivers?: string[] // absent on leashes deployed before the allowlist
}
export type WindowView = { started_at_ms: string; resets_at_ms: string; spent: string; remaining: string }
export type PendingSpend = {
  id: string
  receiver_id: string
  amount: string
  memo: string
  reason: 'UnknownReceiver' | 'OverPerTxLimit' | 'OverWindowLimit'
  created_at_ms: string
}
export type Stats = {
  attempts: number
  sent: number
  sent_total: string
  held: number
  refused: number
  approved: number
  approved_total: string
  rejected: number
}
export type Owner = { public_key: string; rp_id: string; origins: string[] }
export type AgentKey = { publicKey: string; allowance: string | null }

export type OwnerAction =
  | { action: 'approve'; id: string }
  | { action: 'reject'; id: string }
  | { action: 'reject_all'; count: number }
  | { action: 'revoke_agent_key'; public_key: string }
  | { action: 'withdraw'; receiver_id: string; amount: string }
  | { action: 'set_policy'; policy: Required<Policy> }
  | { action: 'add_agent_key'; public_key: string; allowance: string }

export type LeashSnapshot = {
  owner: Owner
  policy: Policy
  window: WindowView
  pending: PendingSpend[]
  stats: Stats
  agentKeys: AgentKey[]
  balance: string
  /** Balance not locked for storage: the most a withdraw can send. */
  available: string
}

// ------------------------------------------------------------------ reads
//
// Reads use plain JSON-RPC over fetch, without the client library's
// automatic retries: a polling page that retries every failure turns one
// rate-limit response into a flood. The poller backs off instead.

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'leash', method, params }),
  })
  if (!res.ok) throw new Error(`RPC returned HTTP ${res.status}`)
  const body = await res.json()
  if (body.error) throw new Error(body.error.data ?? body.error.cause?.name ?? body.error.message)
  return body.result as T
}

async function view<T>(account: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await rpc<{ result: number[] }>('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: account,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  })
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result))) as T
}

type Overview = Omit<LeashSnapshot, 'agentKeys' | 'balance' | 'available'> & { nonce: string }
type AccessKeyList = {
  keys: {
    public_key: string
    access_key: {
      permission: 'FullAccess' | { FunctionCall: { allowance: string | null; method_names: string[] } }
    }
  }[]
}

let storagePrice: Promise<bigint> | null = null

/** yoctoNEAR locked per byte of account storage, read once from the protocol config. */
function storagePricePerByte(): Promise<bigint> {
  storagePrice ??= rpc<{ runtime_config: { storage_amount_per_byte: string } }>('EXPERIMENTAL_protocol_config', {
    finality: 'final',
  })
    .then((c) => BigInt(c.runtime_config.storage_amount_per_byte))
    .catch((e: unknown) => {
      storagePrice = null
      throw e
    })
  return storagePrice
}

export async function readLeash(account: string): Promise<LeashSnapshot> {
  const [overview, keys, state, pricePerByte] = await Promise.all([
    view<Overview>(account, 'get_overview'),
    rpc<AccessKeyList>('query', { request_type: 'view_access_key_list', finality: 'optimistic', account_id: account }),
    rpc<{ amount: string; storage_usage: number }>('query', {
      request_type: 'view_account',
      finality: 'optimistic',
      account_id: account,
    }),
    storagePricePerByte(),
  ])
  const agentKeys = keys.keys.flatMap((k) => {
    const permission = k.access_key.permission
    if (permission === 'FullAccess') return []
    const { method_names, allowance } = permission.FunctionCall
    return method_names.length === 1 && method_names[0] === 'agent_spend'
      ? [{ publicKey: k.public_key, allowance }]
      : []
  })
  const { owner, policy, window, pending, stats } = overview
  const locked = BigInt(state.storage_usage) * pricePerByte
  const free = BigInt(state.amount) - locked
  const available = (free > 0n ? free : 0n).toString()
  return { owner, policy, window, pending, stats, agentKeys, balance: state.amount, available }
}

// ------------------------------------------------------------------ writes

const RELAY_KEY = 'leash.relayKey'

/** This device's relay key. Created on first use, kept in localStorage. */
export function relayKeyPair(): KeyPair {
  const stored = load<KeyPairString>(RELAY_KEY)
  if (stored) return KeyPair.fromString(stored)
  const fresh = KeyPair.fromRandom('ed25519')
  save(RELAY_KEY, fresh.toString())
  return fresh
}

export function getOwner(account: string) {
  return view<Owner>(account, 'get_owner')
}

/** Is this device's relay key on `account`, scoped to the wallet's own contract? */
async function relayKeyAuthorized(account: string): Promise<boolean> {
  try {
    const key = await rpc<{ permission: 'FullAccess' | { FunctionCall: { receiver_id: string } } }>('query', {
      request_type: 'view_access_key',
      finality: 'final',
      account_id: account,
      public_key: relayKeyPair().getPublicKey().toString(),
    })
    return key.permission !== 'FullAccess' && key.permission.FunctionCall.receiver_id === account
  } catch {
    return false // no such key
  }
}

export function challengeFor(account: string, action: OwnerAction) {
  return view<string>(account, 'get_challenge', { action })
}

/** Submit a passkey-signed owner action. Returns the transaction hash.
 *
 *  Signs with this device's relay key when the wallet has it. Otherwise (a new
 *  phone, or cleared site data) the arena server's relay submits it and pays the
 *  gas. Either way the contract checks the Face ID signature, so neither path
 *  can move money on its own. */
export async function submitOwnerAction(
  account: string,
  action: OwnerAction,
  assertion: WebAuthnAssertion,
): Promise<string> {
  const { action: methodName, ...args } = action
  if (!(await relayKeyAuthorized(account))) return relayOwnerAction(account, methodName, { ...args, assertion })
  const signer = new Account(account, provider, new KeyPairSigner(relayKeyPair()))
  const outcome = await signer.callFunctionRaw({
    contractId: account,
    methodName,
    args: { ...args, assertion },
    gas: config.callGas,
  })
  return outcome.transaction.hash
}

async function relayOwnerAction(account: string, method: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${config.apiUrl}/api/owner-action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, method, args }),
  })
  const body = (await res.json().catch(() => ({}))) as { txHash?: string; error?: string }
  if (!res.ok || !body.txHash) throw new Error(body.error ?? `Relay failed (${res.status})`)
  return body.txHash
}

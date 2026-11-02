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
  rpId: (import.meta.env.VITE_PASSKEY_RP_ID as string | undefined) || window.location.hostname,
  pollMs: Number(env('VITE_POLL_MS')),
  callGas: BigInt(env('VITE_GAS_CALL_TGAS')) * 10n ** 12n,
}

export const OWNER_METHODS = ['approve', 'reject', 'set_policy', 'withdraw', 'add_agent_key', 'revoke_agent_key']

const provider = new JsonRpcProvider({ url: config.rpcUrl })

// ------------------------------------------------------------------ types

export type Policy = {
  per_tx_max: string
  window_max: string
  window_secs: number
  max_pending: number
  max_memo_bytes: number
}
export type WindowView = { started_at_ms: string; resets_at_ms: string; spent: string; remaining: string }
export type PendingSpend = {
  id: string
  receiver_id: string
  amount: string
  memo: string
  reason: 'OverPerTxLimit' | 'OverWindowLimit'
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
  | { action: 'revoke_agent_key'; public_key: string }

export type LeashSnapshot = {
  owner: Owner
  policy: Policy
  window: WindowView
  pending: PendingSpend[]
  stats: Stats
  agentKeys: AgentKey[]
  balance: string
}

// ------------------------------------------------------------------ reads

const view = async <T>(account: string, method: string, args: Record<string, unknown> = {}) =>
  (await provider.callFunction({ contractId: account, method, args })) as T

export async function readLeash(account: string): Promise<LeashSnapshot> {
  const [owner, policy, window, pending, stats, keys, state] = await Promise.all([
    view<Owner>(account, 'get_owner'),
    view<Policy>(account, 'get_policy'),
    view<WindowView>(account, 'get_window'),
    view<PendingSpend[]>(account, 'get_pending'),
    view<Stats>(account, 'get_stats'),
    provider.viewAccessKeyList({ accountId: account, finalityQuery: { finality: 'optimistic' } }),
    provider.viewAccount({ accountId: account, blockQuery: { finality: 'optimistic' } }),
  ])
  const agentKeys = keys.keys.flatMap((k) => {
    const permission = k.access_key.permission
    if (typeof permission === 'string' || !('FunctionCall' in permission)) return []
    const { method_names, allowance } = permission.FunctionCall
    return method_names.length === 1 && method_names[0] === 'agent_spend'
      ? [{ publicKey: k.public_key, allowance: allowance ?? null }]
      : []
  })
  return { owner, policy, window, pending, stats, agentKeys, balance: String(state.amount) }
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

export function challengeFor(account: string, action: OwnerAction) {
  return view<string>(account, 'get_challenge', { action })
}

/** Submit a passkey-signed owner action. Returns the transaction hash. */
export async function submitOwnerAction(
  account: string,
  action: OwnerAction,
  assertion: WebAuthnAssertion,
): Promise<string> {
  const signer = new Account(account, provider, new KeyPairSigner(relayKeyPair()))
  const { action: methodName, ...args } = action
  const outcome = await signer.callFunctionRaw({
    contractId: account,
    methodName,
    args: { ...args, assertion },
    gas: config.callGas,
  })
  return outcome.transaction.hash
}

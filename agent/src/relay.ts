// Owner-action relay. Submits a Face ID-signed owner action (approve, reject,
// withdraw, ...) to a wallet contract and pays the gas from its own account.
//
// It exists for phones whose relay key isn't on the wallet: a new phone, or
// cleared site data, once the wallet has no full-access key left to add one.
// It cannot move wallet money: the contract checks the owner's passkey
// signature on every call, and this account has no key on any wallet.
import { Account, KeyPairSigner, type KeyPairString } from 'near-api-js'
import { config } from './config.ts'
import { provider, withTimeout } from './leash.ts'

/** The contract's passkey-gated methods; nothing else is relayed. */
export const OWNER_METHODS = ['approve', 'reject', 'reject_all', 'set_policy', 'withdraw', 'add_agent_key', 'revoke_agent_key']

export class RelayRefusal extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const list = (value: string | undefined) => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean)

const relayConfig = {
  account: process.env.RELAY_ACCOUNT || '',
  secretKey: process.env.RELAY_SECRET_KEY || '',
  /** Wallets the relay pays gas for. */
  wallets: list(process.env.RELAY_WALLETS),
  rateLimitSeconds: Number(process.env.RELAY_RATE_LIMIT_SECONDS || '0'),
}

export const relayEnabled = () => !!(relayConfig.account && relayConfig.secretKey && relayConfig.wallets.length)

const lastByVisitor = new Map<string, number>()

type Body = { account?: unknown; method?: unknown; args?: unknown }
type Args = Record<string, unknown> & { assertion?: { client_data_json?: unknown } }

/** Checks a request, then submits it. Returns the transaction hash. */
export async function relayOwnerAction(visitor: string, body: Body): Promise<string> {
  if (!relayEnabled()) throw new RelayRefusal('The relay is not configured on this server.', 503)
  const { account, method, args } = body
  if (typeof account !== 'string' || !relayConfig.wallets.includes(account)) {
    throw new RelayRefusal('The relay only serves the demo wallets. Use your own relay key for yours.', 403)
  }
  if (typeof method !== 'string' || !OWNER_METHODS.includes(method)) {
    throw new RelayRefusal('Only passkey-signed owner actions are relayed.', 400)
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new RelayRefusal('args must be an object.', 400)

  const now = Date.now()
  const last = lastByVisitor.get(visitor)
  if (last && now - last < relayConfig.rateLimitSeconds * 1000) {
    throw new RelayRefusal(`One relayed action every ${relayConfig.rateLimitSeconds}s.`, 429)
  }

  // Don't pay gas for a signature over a different action or an old nonce:
  // the contract would reject it anyway.
  const { assertion, ...rest } = args as Args
  let challenge: unknown
  try {
    challenge = JSON.parse(String(assertion?.client_data_json)).challenge
  } catch {
    throw new RelayRefusal('Missing or invalid passkey signature.', 400)
  }
  const expected = await withTimeout(
    provider.callFunction({ contractId: account, method: 'get_challenge', args: { action: { action: method, ...rest } } }),
    config.nearTimeoutMs,
    'challenge read',
  )
  if (typeof challenge !== 'string' || challenge.replace(/=+$/, '') !== String(expected).replace(/=+$/, '')) {
    throw new RelayRefusal('This approval is for a different action or is out of date. Refresh and sign again.', 409)
  }

  lastByVisitor.set(visitor, now) // from here on the relay spends gas
  const relayer = new Account(relayConfig.account, provider, KeyPairSigner.fromSecretKey(relayConfig.secretKey as KeyPairString))
  let outcome: Awaited<ReturnType<Account['callFunctionRaw']>>
  try {
    outcome = await withTimeout(
      relayer.callFunctionRaw({ contractId: account, methodName: method, args, gas: config.callGas }),
      config.nearTimeoutMs,
      method,
    )
  } catch (e) {
    throw refusal(e instanceof Error ? e.message : String(e))
  }
  const status = outcome.status as { SuccessValue?: string; Failure?: unknown }
  if (status.Failure !== undefined) throw refusal(JSON.stringify(status.Failure))
  return outcome.transaction.hash
}

/** Turn a NEAR failure into the contract's own panic message where there is one. */
function refusal(text: string) {
  const panic = /panicked: ([^"\\]+)/.exec(text)?.[1]
  return new RelayRefusal(panic ? `The contract refused: ${panic}` : 'The contract refused the action.', 400)
}

// The agent's only way to move money: agent_spend on its own leash contract,
// signed with a function-call key that can call nothing else.
import { Account, JsonRpcProvider, KeyPairSigner, nearToYocto, yoctoToNear, type KeyPairString } from 'near-api-js'
import { config } from './config.ts'

export type SpendOutcome =
  | { outcome: 'sent' }
  | { outcome: 'held'; id: string; reason: 'OverPerTxLimit' | 'OverWindowLimit' }
  | { outcome: 'refused'; reason: string }

export type SpendResult = SpendOutcome & { txUrl: string }

export const provider = new JsonRpcProvider({ url: config.rpcUrl }, { retries: config.nearRetries })

/** Reject after `ms`. The underlying call may still finish; callers must treat
 *  a timed-out spend as "status unknown", never as "not sent". */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms; status unknown`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function agentAccount(secretKey: string = config.agentSecretKey) {
  return new Account(config.leashAccount, provider, KeyPairSigner.fromSecretKey(secretKey as KeyPairString))
}

export async function spend(receiverId: string, amountNear: string, memo?: string): Promise<SpendResult> {
  const outcome = await withTimeout(
    agentAccount().callFunctionRaw({
      contractId: config.leashAccount,
      methodName: 'agent_spend',
      args: { receiver_id: receiverId, amount: nearToYocto(amountNear as `${number}`).toString(), memo: memo ?? null },
      gas: config.callGas,
    }),
    config.nearTimeoutMs,
    'agent_spend',
  )
  const status = outcome.status as { SuccessValue?: string }
  if (status.SuccessValue === undefined) throw new Error(`agent_spend failed: ${JSON.stringify(outcome.status)}`)
  const result = JSON.parse(Buffer.from(status.SuccessValue, 'base64').toString()) as SpendOutcome
  return { ...result, txUrl: `${config.explorerTxUrl}${outcome.transaction.hash}` }
}

type WindowView = { spent: string; remaining: string; resets_at_ms: string }
type Policy = { per_tx_max: string; window_max: string }

export async function budget() {
  const [window, policy] = await withTimeout(Promise.all([
    provider.callFunction({ contractId: config.leashAccount, method: 'get_window', args: {} }) as Promise<WindowView>,
    provider.callFunction({ contractId: config.leashAccount, method: 'get_policy', args: {} }) as Promise<Policy>,
  ]), config.nearTimeoutMs, 'budget read')
  return {
    perPaymentLimitNear: yoctoToNear(policy.per_tx_max as `${bigint}`),
    windowLimitNear: yoctoToNear(policy.window_max as `${bigint}`),
    spentNear: yoctoToNear(window.spent as `${bigint}`),
    remainingNear: yoctoToNear(window.remaining as `${bigint}`),
    resetsAt: new Date(Number(window.resets_at_ms)).toISOString(),
  }
}

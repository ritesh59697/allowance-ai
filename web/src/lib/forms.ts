// Turns owner-form input into contract arguments. Everything here is checked
// before the passkey prompt, so a typo never costs a Face ID round trip. The
// contract checks the same rules again.
import { parseNearAmount } from 'near-api-js'
import type { Policy } from './near'

const SECONDS_PER_HOUR = 3600

// NEAR protocol account ID rules: 2-64 chars, lowercase alphanumerics
// separated by single '-', '_' or '.'.
const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
const ACCOUNT_ID_LENGTH = { min: 2, max: 64 }

export function isAccountId(value: string): boolean {
  return value.length >= ACCOUNT_ID_LENGTH.min && value.length <= ACCOUNT_ID_LENGTH.max && ACCOUNT_ID.test(value)
}

/** "1.5" -> yoctoNEAR string. Throws unless it is a positive amount. */
export function toYocto(amount: string, label: string): string {
  const trimmed = amount.trim()
  const yocto = /^\d*\.?\d+$/.test(trimmed) ? parseNearAmount(trimmed as `${number}`) : null
  if (!yocto || BigInt(yocto) <= 0n) throw new Error(`${label}: enter an amount above 0`)
  return yocto
}

function positiveInt(value: string, label: string): number {
  const n = Number(value.trim())
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${label}: enter a whole number above 0`)
  return n
}

/** Commas, spaces or newlines between accounts. Duplicates are dropped. */
export function parseAllowlist(text: string): string[] {
  const accounts = [...new Set(text.split(/[\s,]+/).filter(Boolean))]
  const bad = accounts.find((a) => !isAccountId(a))
  if (bad) throw new Error(`"${bad}" is not a NEAR account`)
  return accounts
}

export type PolicyFields = {
  perTx: string
  window: string
  windowHours: string
  maxPending: string
  allowlist: string
}

export function policyFields(policy: Policy, toNear: (yocto: string) => string): PolicyFields {
  return {
    perTx: toNear(policy.per_tx_max),
    window: toNear(policy.window_max),
    windowHours: String(policy.window_secs / SECONDS_PER_HOUR),
    maxPending: String(policy.max_pending),
    allowlist: (policy.allowed_receivers ?? []).join('\n'),
  }
}

/** Builds the full policy to sign. Fields the form doesn't show keep their current value. */
export function buildPolicy(current: Policy, fields: PolicyFields): Required<Policy> {
  const per_tx_max = toYocto(fields.perTx, 'Per payment')
  const window_max = toYocto(fields.window, 'Per window')
  if (BigInt(window_max) < BigInt(per_tx_max)) throw new Error('Per window must be at least the per-payment limit')
  const hours = Number(fields.windowHours.trim())
  const window_secs = Math.round(hours * SECONDS_PER_HOUR)
  if (!Number.isFinite(hours) || window_secs <= 0) throw new Error('Window: enter a length above 0 hours')
  return {
    per_tx_max,
    window_max,
    window_secs,
    max_pending: positiveInt(fields.maxPending, 'Held requests'),
    max_memo_bytes: current.max_memo_bytes,
    allowed_receivers: parseAllowlist(fields.allowlist),
  }
}

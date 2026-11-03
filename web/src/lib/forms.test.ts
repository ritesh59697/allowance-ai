import { describe, expect, it } from 'vitest'
import { buildPolicy, isAccountId, parseAllowlist, policyFields, toYocto } from './forms'
import { near } from './format'
import type { Policy } from './near'

const current: Policy = {
  per_tx_max: toYocto('0.5', 'x'),
  window_max: toYocto('1', 'x'),
  window_secs: 86_400,
  max_pending: 10,
  max_memo_bytes: 256,
  allowed_receivers: ['vendor.acme.testnet'],
}

describe('owner forms', () => {
  it('converts NEAR to yocto and rejects junk', () => {
    expect(toYocto('1.5', 'Amount')).toBe('1500000000000000000000000')
    for (const bad of ['', '0', '-1', 'abc', '1e3']) expect(() => toYocto(bad, 'Amount')).toThrow('Amount')
  })

  it('checks account IDs', () => {
    expect(isAccountId('vendor.acme-test.testnet')).toBe(true)
    for (const bad of ['a', 'Vendor.testnet', 'x..testnet', '-x.testnet', 'x'.repeat(65)]) {
      expect(isAccountId(bad)).toBe(false)
    }
  })

  it('splits and dedupes the allowlist', () => {
    expect(parseAllowlist('a.testnet, b.testnet\na.testnet ')).toEqual(['a.testnet', 'b.testnet'])
    expect(parseAllowlist('  ')).toEqual([])
    expect(() => parseAllowlist('a.testnet BAD')).toThrow('"BAD"')
  })

  it('round-trips the current policy unchanged', () => {
    expect(buildPolicy(current, policyFields(current, near))).toEqual(current)
  })

  it('keeps fields the form does not show', () => {
    const next = buildPolicy(current, { ...policyFields(current, near), perTx: '0.25', windowHours: '1' })
    expect(next.max_memo_bytes).toBe(current.max_memo_bytes)
    expect(next.window_secs).toBe(3600)
    expect(next.per_tx_max).toBe(toYocto('0.25', 'x'))
  })

  it('refuses a window smaller than one payment', () => {
    expect(() => buildPolicy(current, { ...policyFields(current, near), perTx: '2', window: '1' })).toThrow(
      'at least the per-payment',
    )
  })
})

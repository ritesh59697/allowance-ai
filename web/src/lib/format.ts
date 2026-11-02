import { formatNearAmount } from 'near-api-js'

/** yoctoNEAR string -> "1.25" (trailing zeros trimmed, up to 4 decimals). */
export function near(yocto: string): string {
  const s = formatNearAmount(yocto, 4).replace(/,/g, '')
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

export function percent(part: string, whole: string): number {
  const w = BigInt(whole)
  if (w === 0n) return 0
  return Math.min(100, Number((BigInt(part) * 10_000n) / w) / 100)
}

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.round((ms - now) / 1000)
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 60) return rtf.format(diff, 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86_400), 'day')
}

export const shortKey = (key: string) => `${key.slice(0, 14)}…${key.slice(-6)}`

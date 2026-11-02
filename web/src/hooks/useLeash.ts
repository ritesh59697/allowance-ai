import { useCallback, useEffect, useRef, useState } from 'react'
import { config, readLeash, type LeashSnapshot, type PendingSpend } from '@/lib/near'

const BUZZ_PATTERN = [180, 80, 180]
/** On errors the poll interval doubles, up to this many times the base. */
const MAX_BACKOFF_FACTOR = 8

/** Polls the leash contract and buzzes when a new held request shows up. */
export function useLeash(account: string) {
  const [snapshot, setSnapshot] = useState<LeashSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const inFlight = useRef<Promise<boolean> | null>(null)

  /** One read. Never overlaps itself. Resolves true on success. */
  const refresh = useCallback(() => {
    if (!account) return Promise.resolve(false)
    if (inFlight.current) return inFlight.current
    const run = readLeash(account)
      .then((next) => {
        setSnapshot(next)
        setError(null)
        const fresh = newRequests(seen.current, next.pending)
        seen.current = new Set(next.pending.map((p) => p.id))
        if (fresh.length) alertOwner(fresh)
        return true
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        return false
      })
      .finally(() => {
        inFlight.current = null
      })
    inFlight.current = run
    return run
  }, [account])

  useEffect(() => {
    seen.current = null
    setSnapshot(null)
    setError(null)
    if (!account) return
    let timer: ReturnType<typeof setTimeout>
    let factor = 1
    let stopped = false
    const tick = async () => {
      const ok = await refresh()
      factor = ok ? 1 : Math.min(factor * 2, MAX_BACKOFF_FACTOR)
      if (!stopped) timer = setTimeout(tick, config.pollMs * factor)
    }
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [account, refresh])

  return { snapshot, error, refresh }
}

function newRequests(seen: Set<string> | null, pending: PendingSpend[]) {
  // First load is not "new": don't buzz for requests that were already waiting.
  if (!seen) return []
  return pending.filter((p) => !seen.has(p.id))
}

function alertOwner(fresh: PendingSpend[]) {
  navigator.vibrate?.(BUZZ_PATTERN)
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('Your agent needs approval', {
      body: `${fresh.length} spend request${fresh.length > 1 ? 's' : ''} held by the leash`,
      tag: 'leash-pending',
    })
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { config, readLeash, type LeashSnapshot, type PendingSpend } from '@/lib/near'

const BUZZ_PATTERN = [180, 80, 180]

/** Polls the leash contract and buzzes when a new held request shows up. */
export function useLeash(account: string) {
  const [snapshot, setSnapshot] = useState<LeashSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef<Set<string> | null>(null)

  const refresh = useCallback(async () => {
    if (!account) return
    try {
      const next = await readLeash(account)
      setSnapshot(next)
      setError(null)
      const fresh = newRequests(seen.current, next.pending)
      seen.current = new Set(next.pending.map((p) => p.id))
      if (fresh.length) alertOwner(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [account])

  useEffect(() => {
    seen.current = null
    setSnapshot(null)
    refresh()
    const timer = setInterval(refresh, config.pollMs)
    return () => clearInterval(timer)
  }, [refresh])

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

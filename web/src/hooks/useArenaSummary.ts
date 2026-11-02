import { useCallback, useEffect, useState } from 'react'
import { getSummary, type ArenaSummary } from '@/lib/arena'
import { config } from '@/lib/near'

const POLL_MS = Number(import.meta.env.VITE_ARENA_POLL_MS ?? config.pollMs)

/** Polls the arena server's summary (its chain snapshot spares every browser from polling the RPC). */
export function useArenaSummary() {
  const [summary, setSummary] = useState<ArenaSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setSummary(await getSummary())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return { summary, error, refresh }
}

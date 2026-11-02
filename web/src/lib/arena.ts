// Client for the arena server (agent/src/server.ts).
const API = (import.meta.env.VITE_ARENA_API_URL as string | undefined) ?? ''

export type PayAttempt = { receiver: string; amountNear: string; outcome: string; txUrl?: string; approvedPayee: boolean }
export type Mode = 'guarded' | 'jailbroken'
export type AttemptRecord = {
  id: number
  at: string
  handle: string
  mode?: Mode
  model?: string
  fooled: boolean
  pays: PayAttempt[]
}
export type ArenaSummary = {
  leashAccount: string
  models: Record<Mode, string>
  attempts: number
  fooled: number
  strangerPaymentsSent: number
  recent: AttemptRecord[]
}
export type ArenaEvent =
  | { kind: 'model'; text: string }
  | { kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; result: { outcome?: string; reason?: string; txUrl?: string; error?: string } }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Arena server returned ${res.status}`)
  return body as T
}

export const getSummary = () => call<ArenaSummary>('/api/arena')

export const sendAttempt = (handle: string, message: string, mode: Mode) =>
  call<{ record: AttemptRecord; events: ArenaEvent[] }>('/api/attempt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle, message, mode }),
  })

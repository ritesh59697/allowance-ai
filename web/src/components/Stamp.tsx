import { cn } from '@/lib/utils'

export type StampTone = 'sent' | 'held' | 'neutral'

const TONE: Record<StampTone, string> = {
  sent: 'border-positive/40 text-positive',
  held: 'border-warning/40 text-warning',
  neutral: 'border-border text-muted-foreground',
}

/** The outcome mark used everywhere a payment's fate is shown, like a status on a statement. */
export function Stamp({ tone, children, className }: { tone: StampTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-sm border px-2 font-mono text-xs leading-none whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Tone for an `agent_spend` outcome as the contract reports it. */
export function outcomeTone(outcome: string | undefined): StampTone {
  return outcome === 'sent' ? 'sent' : outcome === 'held' ? 'held' : 'neutral'
}

export const REASON_LABEL: Record<string, string> = {
  UnknownReceiver: 'Not an approved payee',
  OverPerTxLimit: 'Over the per-payment cap',
  OverWindowLimit: 'Over the window cap',
}

import { Fingerprint } from 'lucide-react'
import { REASON_LABEL, Stamp } from '@/components/Stamp'
import { Button } from '@/components/ui/button'
import { near, relativeTime } from '@/lib/format'
import type { PendingSpend } from '@/lib/near'

type Props = {
  request: PendingSpend
  busy: 'approve' | 'reject' | null
  disabledReason: string | null
  onApprove: () => void
  onReject: () => void
}

export function PendingCard({ request, busy, disabledReason, onApprove, onReject }: Props) {
  const disabled = busy !== null || disabledReason !== null
  return (
    <article
      aria-label={`Held request ${request.id}`}
      className="flex flex-col overflow-hidden rounded-xl border bg-card animate-in fade-in slide-in-from-bottom-1 duration-300"
    >
      <header className="flex items-center justify-between gap-3 px-5 pt-5">
        <span className="text-sm text-muted-foreground">
          Request #{request.id} · {relativeTime(Number(request.created_at_ms))}
        </span>
        <Stamp tone="held">{REASON_LABEL[request.reason] ?? request.reason}</Stamp>
      </header>
      <div className="flex flex-col gap-1 px-5 pt-4">
        <p className="font-mono text-2xl font-medium leading-none">{near(request.amount)} NEAR</p>
        {/* Never truncate: the receiver is what the owner is approving. */}
        <p className="break-all font-mono text-sm text-muted-foreground">to {request.receiver_id}</p>
      </div>

      {request.memo && (
        <figure className="mx-5 mt-4 rounded-md bg-muted px-3 py-2">
          <figcaption className="text-xs text-faint">Agent's note, written by the agent and may be manipulated</figcaption>
          <blockquote className="break-words font-mono text-sm text-muted-foreground">{request.memo}</blockquote>
        </figure>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t p-5">
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" className="h-11" disabled={disabled} onClick={onReject}>
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </Button>
          <Button size="lg" className="h-11" disabled={disabled} onClick={onApprove}>
            <Fingerprint strokeWidth={1.5} aria-hidden />
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
        </div>
        {disabledReason && <p className="text-sm text-faint">{disabledReason}</p>}
      </div>
    </article>
  )
}

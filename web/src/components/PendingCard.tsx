import { ScanFace, ShieldX, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { near, relativeTime } from '@/lib/format'
import type { PendingSpend } from '@/lib/near'

const REASON_LABEL: Record<PendingSpend['reason'], string> = {
  UnknownReceiver: 'Not an approved payee',
  OverPerTxLimit: 'Over per-payment limit',
  OverWindowLimit: 'Over window limit',
}

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
      className="flex flex-col gap-4 rounded-lg border border-warning/40 bg-card p-4 animate-in fade-in slide-in-from-bottom-1 duration-200"
    >
      <header className="flex flex-col items-start gap-2">
        <Badge variant="outline" className="border-warning/50 text-warning">
          <TriangleAlert aria-hidden />
          {REASON_LABEL[request.reason]}
        </Badge>
        <p className="font-mono text-2xl font-medium leading-tight">{near(request.amount)} NEAR</p>
        {/* Never truncate: the receiver is what the owner is approving. */}
        <p className="break-all font-mono text-sm text-muted-foreground">to {request.receiver_id}</p>
      </header>

      {request.memo && (
        <figure className="flex flex-col gap-1">
          <figcaption className="text-xs text-muted-foreground">
            Agent's note (written by the agent, may be manipulated)
          </figcaption>
          <blockquote className="break-words rounded-sm bg-muted px-3 py-2 font-mono text-sm">
            {request.memo}
          </blockquote>
        </figure>
      )}

      <p className="text-xs text-muted-foreground">
        Request #{request.id} · held {relativeTime(Number(request.created_at_ms))}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="destructive" size="lg" className="h-11" disabled={disabled} onClick={onReject}>
          <ShieldX aria-hidden />
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
        <Button size="lg" className="h-11" disabled={disabled} onClick={onApprove}>
          <ScanFace aria-hidden />
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
      </div>
      {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
    </article>
  )
}

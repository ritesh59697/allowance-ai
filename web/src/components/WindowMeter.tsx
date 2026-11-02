import { Progress } from '@/components/ui/progress'
import { near, percent, relativeTime } from '@/lib/format'
import type { Policy, WindowView } from '@/lib/near'

export function WindowMeter({ window, policy }: { window: WindowView; policy: Policy }) {
  const used = percent(window.spent, policy.window_max)
  return (
    <section aria-labelledby="window-heading" className="flex flex-col gap-3">
      <h2 id="window-heading" className="text-xs uppercase tracking-wider text-muted-foreground">
        Spent without asking
      </h2>
      <p className="font-mono text-3xl font-medium leading-tight">
        {near(window.spent)}
        <span className="text-muted-foreground"> / {near(policy.window_max)} NEAR</span>
      </p>
      <Progress value={used} aria-label={`${used}% of the window limit used`} className="h-1.5" />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Per payment, on its own</dt>
          <dd className="font-mono">up to {near(policy.per_tx_max)} NEAR</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Window resets</dt>
          <dd className="font-mono">{relativeTime(Number(window.resets_at_ms))}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Approved payees</dt>
          <dd className="break-all font-mono">
            {policy.allowed_receivers?.length ? policy.allowed_receivers.join(', ') : 'any account'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

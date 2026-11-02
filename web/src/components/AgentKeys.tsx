import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { near, shortKey } from '@/lib/format'
import type { AgentKey } from '@/lib/near'

type Props = {
  keys: AgentKey[]
  busyKey: string | null
  disabledReason: string | null
  onRevoke: (publicKey: string) => void
}

export function AgentKeys({ keys, busyKey, disabledReason, onRevoke }: Props) {
  return (
    <section aria-labelledby="keys-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="keys-heading" className="font-medium">
          Agent keys
        </h2>
        <p className="text-sm text-muted-foreground">
          Each can call <code className="font-mono text-foreground">agent_spend</code> and nothing else.
        </p>
      </div>
      {keys.length === 0 ? (
        <p className="rounded-xl border px-5 py-4 text-sm text-muted-foreground">
          No agent key. The agent cannot spend at all.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {keys.map((k) => (
            <li key={k.publicKey} className="flex items-center gap-3 px-5 py-3">
              <KeyRound className="size-4 shrink-0 text-faint" strokeWidth={1.5} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm" title={k.publicKey}>
                  {shortKey(k.publicKey)}
                </p>
                <p className="text-xs text-faint">
                  gas budget {k.allowance ? `${near(k.allowance)} NEAR left` : 'unlimited'}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={busyKey !== null || disabledReason !== null}
                onClick={() => onRevoke(k.publicKey)}
              >
                {busyKey === k.publicKey ? 'Revoking…' : 'Revoke'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

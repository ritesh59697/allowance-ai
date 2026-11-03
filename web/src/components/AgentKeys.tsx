import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { near, shortKey } from '@/lib/format'
import { toYocto } from '@/lib/forms'
import type { AgentKey } from '@/lib/near'

type Props = {
  keys: AgentKey[]
  busyKey: string | null
  adding: boolean
  disabledReason: string | null
  onRevoke: (publicKey: string) => void
  onAdd: (publicKey: string, allowance: string) => Promise<boolean>
}

export function AgentKeys({ keys, busyKey, adding, disabledReason, onRevoke, onAdd }: Props) {
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
                disabled={busyKey !== null || adding || disabledReason !== null}
                onClick={() => onRevoke(k.publicKey)}
              >
                {busyKey === k.publicKey ? 'Revoking…' : 'Revoke'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AddKeyForm busy={adding} locked={busyKey !== null || adding || disabledReason !== null} onAdd={onAdd} />
    </section>
  )
}

function AddKeyForm({
  busy,
  locked,
  onAdd,
}: {
  busy: boolean
  locked: boolean
  onAdd: (publicKey: string, allowance: string) => Promise<boolean>
}) {
  const [publicKey, setPublicKey] = useState('')
  const [allowance, setAllowance] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const key = publicKey.trim()
      if (!key.includes(':')) throw new Error('Public key: paste it with its prefix, e.g. ed25519:…')
      if (await onAdd(key, toYocto(allowance, 'Gas budget'))) {
        setPublicKey('')
        setAllowance('')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Field id="agent-key" label="New agent key (public)">
          <Input id="agent-key" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="ed25519:…" />
        </Field>
        <Field id="agent-allowance" label="Gas budget (NEAR)">
          <Input
            id="agent-allowance"
            inputMode="decimal"
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-faint">The key will be able to call agent_spend and nothing else.</p>
        <Button type="submit" size="sm" disabled={locked}>
          {busy ? 'Adding…' : 'Add key'}
        </Button>
      </div>
    </form>
  )
}

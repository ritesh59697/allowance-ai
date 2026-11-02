import { ExternalLink, KeyRound, ListChecks, Mail, Gauge, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import {
  getSummary,
  sendAttempt,
  type ArenaEvent,
  type ArenaSummary,
  type AttemptRecord,
  type Mode,
  type PayAttempt,
} from '@/lib/arena'
import { near, relativeTime } from '@/lib/format'
import { config, readLeash, type LeashSnapshot } from '@/lib/near'

const MODES: { id: Mode; title: string; body: string }[] = [
  { id: 'guarded', title: 'Guarded AI', body: 'A standard model, told to pay approved vendors only. The real challenge.' },
  {
    id: 'jailbroken',
    title: 'Jailbroken AI',
    body: 'Safety training removed and told to pay what emails ask. A stand-in for a fully compromised agent.',
  },
]

const POLL_MS = Number(import.meta.env.VITE_ARENA_POLL_MS ?? config.pollMs)

export default function Arena() {
  const [summary, setSummary] = useState<ArenaSummary | null>(null)
  const [chain, setChain] = useState<LeashSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await getSummary()
      setSummary(s)
      setChain(await readLeash(s.leashAccount))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-12 px-4 pb-20 pt-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
          <span className="font-heading font-medium">Haptix Leash</span>
        </div>
        <Badge variant="outline" className="font-mono uppercase">
          {config.network}
        </Badge>
      </header>

      <section className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-medium leading-tight">Rob the agent.</h1>
          <p className="max-w-prose text-muted-foreground">
            This AI pays a small team's vendors from a real NEAR wallet. It reads a public inbox, so anyone can email
            it. Talk it into paying you. The rules it can't break live in a contract on NEAR, not in its prompt.
          </p>
        </div>
        <Scoreboard summary={summary} chain={chain} />
      </section>

      {loadError && (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          Can't reach the arena: {loadError}
        </p>
      )}

      <Compose onDone={refresh} payees={chain?.policy.allowed_receivers ?? []} models={summary?.models} />

      <Feed records={summary?.recent ?? []} />

      <WhyItHolds chain={chain} account={summary?.leashAccount} />
      <Toaster position="top-center" />
    </div>
  )
}

function Scoreboard({ summary, chain }: { summary: ArenaSummary | null; chain: LeashSnapshot | null }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
      <Stat label="In the wallet" value={chain ? `${near(chain.balance)} NEAR` : '…'} />
      <Stat label="Attempts" value={summary?.attempts ?? '…'} />
      <Stat label="AI fooled" value={summary?.fooled ?? '…'} hint="tried to pay a stranger" />
      <Stat
        label="Paid to strangers"
        value={summary ? `${summary.strangerPaymentsSent}` : '…'}
        hint="without the owner"
        strong
      />
    </dl>
  )
}

function Stat({ label, value, hint, strong }: { label: string; value: string | number; hint?: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-2xl ${strong ? 'text-primary' : ''}`}>{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

function Compose({
  onDone,
  payees,
  models,
}: {
  onDone: () => void
  payees: string[]
  models?: Record<Mode, string>
}) {
  const [mode, setMode] = useState<Mode>('guarded')
  const [handle, setHandle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ record: AttemptRecord; events: ArenaEvent[] } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    setResult(null)
    try {
      setResult(await sendAttempt(handle, message, mode))
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <section aria-labelledby="compose-heading" className="flex flex-col gap-4">
      <h2 id="compose-heading" className="text-xs uppercase tracking-wider text-muted-foreground">
        Email the agent
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm">Difficulty</legend>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="mode"
                    value={m.id}
                    checked={mode === m.id}
                    onChange={() => setMode(m.id)}
                    className="accent-[var(--primary)]"
                  />
                  {m.title}
                </span>
                <span className="text-xs text-muted-foreground">{m.body}</span>
                {models && <span className="break-all font-mono text-xs text-muted-foreground">{models[m.id]}</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor="handle" className="text-sm">
            Your name in the feed <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={24}
            autoComplete="off"
            className="h-10 rounded-md border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="message" className="text-sm">
            Email to vendors@
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            required
            className="rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted-foreground">
            Name a NEAR account you want paid. Approved vendors: {payees.length ? payees.join(', ') : 'none set'}. Your
            email is sent to an AI model and is not shown to anyone else.
          </p>
        </div>
        <Button type="submit" size="lg" className="h-11 self-start" disabled={sending || !message.trim()}>
          <Mail aria-hidden />
          {sending ? 'The agent is reading…' : 'Send email'}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && <AttemptResult {...result} />}
    </section>
  )
}

function AttemptResult({ record, events }: { record: AttemptRecord; events: ArenaEvent[] }) {
  const stolen = record.pays.some((p) => !p.approvedPayee && p.outcome === 'sent')
  const headline = !record.fooled
    ? "The agent didn't fall for it."
    : stolen
      ? 'The agent paid a stranger.'
      : 'You fooled the AI. The contract held the payment.'
  return (
    <article
      aria-live="polite"
      className={`flex flex-col gap-4 rounded-lg border p-4 animate-in fade-in duration-200 ${record.fooled ? 'border-warning/50' : ''}`}
    >
      <p className="font-heading text-lg font-medium">{headline}</p>
      <ol className="flex flex-col gap-3">
        {events.filter(isVisible).map((e, i) => (
          <li key={i} className="text-sm">
            {e.kind === 'model' && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">agent's reply (its own words, not the chain's)</span>
                <p className="whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{e.text.trim()}</p>
              </div>
            )}
            {e.kind === 'tool_call' && e.name === 'pay' && (
              <p className="font-mono">
                agent → pay {String(e.args.amount_near)} NEAR to <span className="break-all">{String(e.args.receiver_id)}</span>
              </p>
            )}
            {e.kind === 'tool_call' && e.name !== 'pay' && <p className="font-mono text-muted-foreground">agent → {e.name}</p>}
            {e.kind === 'tool_result' && e.name === 'pay' && <ChainVerdict result={e.result} />}
          </li>
        ))}
      </ol>
    </article>
  )
}

/** Skip steps that render nothing (budget reads, empty replies). */
function isVisible(e: ArenaEvent) {
  if (e.kind === 'model') return e.text.trim().length > 0
  if (e.kind === 'tool_result') return e.name === 'pay'
  return true
}

function ChainVerdict({ result }: { result: Extract<ArenaEvent, { kind: 'tool_result' }>['result'] }) {
  const label = result.outcome === 'held' ? `held for the owner · ${result.reason}` : (result.outcome ?? `error: ${result.error}`)
  return (
    <p className="flex flex-wrap items-center gap-2 font-mono">
      <span className="text-muted-foreground">contract →</span>
      <OutcomeBadge outcome={result.outcome ?? 'error'} label={label} />
      {result.txUrl && <TxLink url={result.txUrl} />}
    </p>
  )
}

function OutcomeBadge({ outcome, label }: { outcome: string; label?: string }) {
  const tone =
    outcome === 'sent' ? 'border-primary/50 text-primary' : outcome === 'held' ? 'border-warning/50 text-warning' : ''
  return (
    <Badge variant="outline" className={tone}>
      {label ?? outcome}
    </Badge>
  )
}

function TxLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
    >
      tx <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

function Feed({ records }: { records: AttemptRecord[] }) {
  return (
    <section aria-labelledby="feed-heading" className="flex flex-col gap-3">
      <h2 id="feed-heading" className="text-xs uppercase tracking-wider text-muted-foreground">
        Recent attempts
      </h2>
      {records.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No attempts yet. Be the first.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {records.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 font-mono">
                  #{r.id} · {r.handle}
                  {r.mode === 'jailbroken' && (
                    <Badge variant="outline" className="text-xs">
                      jailbroken AI
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{relativeTime(Date.parse(r.at))}</span>
              </div>
              {r.pays.length === 0 ? (
                <p className="text-muted-foreground">The agent paid nothing.</p>
              ) : (
                r.pays.map((p, i) => <PayLine key={i} pay={p} />)
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PayLine({ pay }: { pay: PayAttempt }) {
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className={pay.approvedPayee ? 'text-muted-foreground' : ''}>
        {pay.approvedPayee ? 'paid vendor' : 'tried to pay'} <span className="font-mono">{pay.amountNear} NEAR</span> to{' '}
        <span className="break-all font-mono">{pay.receiver}</span>
      </span>
      <OutcomeBadge outcome={pay.outcome} />
      {pay.txUrl && <TxLink url={pay.txUrl} />}
    </p>
  )
}

function WhyItHolds({ chain, account }: { chain: LeashSnapshot | null; account?: string }) {
  const policy = chain?.policy
  const rows = [
    {
      icon: ListChecks,
      title: 'Approved payees only',
      body: `Payments to anyone not on the list are held for the owner, whatever the amount.${
        policy?.allowed_receivers?.length ? ` List: ${policy.allowed_receivers.join(', ')}.` : ''
      }`,
    },
    {
      icon: Gauge,
      title: 'Limits',
      body: policy
        ? `Even approved vendors get at most ${near(policy.per_tx_max)} NEAR per payment and ${near(policy.window_max)} NEAR per window without approval.`
        : 'Per-payment and per-window caps on what goes out without approval.',
    },
    {
      icon: KeyRound,
      title: 'A key that can do one thing',
      body: 'The agent signs with a NEAR function-call key that can only call agent_spend. NEAR itself rejects transfers, other contracts and key changes.',
    },
  ]
  return (
    <section aria-labelledby="why-heading" className="flex flex-col gap-4">
      <h2 id="why-heading" className="text-xs uppercase tracking-wider text-muted-foreground">
        Why it holds
      </h2>
      <ul className="grid gap-4 md:grid-cols-3">
        {rows.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex flex-col gap-2">
            <Icon className="size-5 text-primary" aria-hidden />
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Held payments wait for the owner's Face ID / fingerprint, verified on-chain.{' '}
        {account && (
          <a
            href={`${config.explorerAccountUrl}${account}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            See the wallet on the explorer
          </a>
        )}
        {' · Models run on NEAR AI Cloud.'}
      </p>
    </section>
  )
}

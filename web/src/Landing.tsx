import {
  ArrowDown,
  ArrowRight,
  Bot,
  CircleCheck,
  ExternalLink,
  FileText,
  Fingerprint,
  KeyRound,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { SiteHeader } from '@/components/SiteHeader'
import { Button } from '@/components/ui/button'
import { useArenaSummary } from '@/hooks/useArenaSummary'
import type { ArenaSummary } from '@/lib/arena'
import { near, relativeTime } from '@/lib/format'
import { config, readLeash, type LeashSnapshot, type Policy, type Stats } from '@/lib/near'

const repoFile = (path: string) => (config.repoUrl ? `${config.repoUrl}/blob/main/${path}` : null)

export default function Landing() {
  const { summary, error } = useArenaSummary()
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-20 px-4 pb-16 pt-6">
      <SiteHeader />
      <Hero summary={summary} error={error} />
      <Flow />
      <Attacks />
      <WhyNear />
      <LiveAccounts summary={summary} />
      <Footer />
    </div>
  )
}

// ------------------------------------------------------------------ hero

function Hero({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  const contract = repoFile('contract/src/lib.rs')
  return (
    <section className="grid gap-10 md:grid-cols-[1.35fr_1fr] md:items-center">
      <div className="flex flex-col gap-5">
        <h1 className="font-heading text-3xl font-medium leading-tight md:text-[2.5rem]">
          Your AI agent will get fooled.
          <br />
          <span className="text-primary">Its wallet won't.</span>
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Allowance gives an AI agent a NEAR wallet it can only spend from inside rules you set. The rules live in a
          smart contract, not in the prompt. A prompt injection can ask for anything; it gets only what the policy
          allows, and everything else waits for your Face ID.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" className="h-11 px-4">
            <a href="/arena">
              Try to rob the agent
              <ArrowRight aria-hidden />
            </a>
          </Button>
          {contract && (
            <Button asChild variant="outline" size="lg" className="h-11 px-4">
              <a href={contract} target="_blank" rel="noreferrer">
                <FileText aria-hidden />
                Read the contract
              </a>
            </Button>
          )}
        </div>
      </div>
      <LivePanel summary={summary} error={error} />
    </section>
  )
}

function LivePanel({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  const chain = summary?.chain
  const rows: [string, string | number, string?][] = chain
    ? [
        ['Payment requests', chain.stats.attempts],
        ['Sent on its own', chain.stats.sent, `${near(chain.stats.sent_total)} NEAR, approved payees only`],
        ['Held for the owner', chain.stats.held],
        ['Paid to strangers', summary.strangerPaymentsSent, 'without the owner'],
      ]
    : []
  return (
    <aside aria-label="Arena wallet, live" className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${chain ? 'bg-primary' : 'bg-muted-foreground'}`} aria-hidden />
          Arena wallet, live
        </span>
        {chain && (
          <span className="text-xs text-muted-foreground">read {relativeTime(Date.parse(chain.readAt))}</span>
        )}
      </div>
      {!chain ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          {error
            ? `Can't reach the arena server: ${error}`
            : 'Waking the arena server. On the free plan this can take up to a minute.'}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1 px-4 py-4">
            <span className="text-xs text-muted-foreground">In the wallet</span>
            <span className="font-mono text-2xl">{near(chain.balance)} NEAR</span>
          </div>
          <dl className="grid grid-cols-2 gap-px border-t bg-border">
            {rows.map(([label, value, hint], i) => (
              <div key={label} className="flex flex-col gap-1 bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={`font-mono text-xl ${i === rows.length - 1 ? 'text-primary' : ''}`}>{value}</dd>
                {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
              </div>
            ))}
          </dl>
        </>
      )}
    </aside>
  )
}

// ------------------------------------------------------------------ how it holds

const STEPS: { icon: LucideIcon; title: string; body: string; by: string }[] = [
  {
    icon: Bot,
    title: 'The agent decides to pay',
    body: 'It reads an invoice or an email and calls pay. Assume this step can be fooled.',
    by: 'an LLM',
  },
  {
    icon: KeyRound,
    title: 'Its key can do one thing',
    body: 'A function-call key that may only call agent_spend on its own account. No transfers, no other contracts, no key changes.',
    by: 'the NEAR protocol',
  },
  {
    icon: ScrollText,
    title: 'The contract checks the rules',
    body: 'Approved payee? Under the per-payment cap? Under the rolling window cap? Yes to all: sent. Otherwise: held.',
    by: 'the Allowance contract',
  },
  {
    icon: Fingerprint,
    title: 'You decide what was held',
    body: 'Approve or reject with Face ID or a fingerprint. The contract verifies the passkey signature itself.',
    by: 'your passkey, on-chain',
  },
]

function Flow() {
  return (
    <section aria-labelledby="flow-heading" className="flex flex-col gap-6">
      <div className="flex max-w-prose flex-col gap-2">
        <h2 id="flow-heading" className="font-heading text-xl font-medium">
          What a fooled agent can actually do
        </h2>
        <p className="text-muted-foreground">
          Request a payment. Nothing else. Each step below is enforced by something the model can't talk to.
        </p>
      </div>
      <ol className="grid gap-3 md:grid-cols-4 md:gap-0">
        {STEPS.map(({ icon: Icon, title, body, by }, i) => (
          <li key={title} className="flex flex-col items-stretch md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-3 self-stretch rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-primary" aria-hidden />
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{body}</p>
              <p className="mt-auto pt-2 font-mono text-xs text-muted-foreground">
                enforced by <span className="text-foreground">{by}</span>
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <span className="flex justify-center py-1 text-muted-foreground md:px-1 md:py-0" aria-hidden>
                <ArrowDown className="size-4 md:hidden" />
                <ArrowRight className="hidden size-4 md:block" />
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="max-w-prose text-sm text-muted-foreground">
        The honest limit: a payment to an approved payee, inside the caps, goes through without asking. That's the
        point of an allowance. The window cap bounds what a fooled agent can lose that way.
      </p>
    </section>
  )
}

// ------------------------------------------------------------------ attacks

const ATTACKS: { title: string; attacker: string; result: string; log: string }[] = [
  {
    title: 'Prompt injection',
    attacker: 'Instructions hidden in a vendor invoice, in several styles, against a guarded and a jailbroken model.',
    result: 'Whatever the model does, payments to the attacker or over the caps are held.',
    log: 'agent/attacks/logs/01-prompt-injection.log',
  },
  {
    title: 'Drip drain',
    attacker: 'A fully compromised agent skips the LLM and sends many small payments, each under the per-payment cap.',
    result: 'The window cap trips. The rest are held.',
    log: 'agent/attacks/logs/02-drip-drain.log',
  },
  {
    title: 'Key misuse',
    attacker:
      'The agent key used directly: raw transfer, another contract, an owner method, adding a key, deleting the account.',
    result: 'NEAR rejects every one before any contract code runs.',
    log: 'agent/attacks/logs/03-key-misuse.log',
  },
]

function Attacks() {
  return (
    <section aria-labelledby="attacks-heading" className="flex flex-col gap-6">
      <div className="flex max-w-prose flex-col gap-2">
        <h2 id="attacks-heading" className="font-heading text-xl font-medium">
          Attacked on testnet, logs in the repo
        </h2>
        <p className="text-muted-foreground">
          Three scripts run against a live leash. Each one prints every transaction with an explorer link.
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border">
        {ATTACKS.map(({ title, attacker, result, log }) => {
          const href = repoFile(log)
          return (
            <li key={title} className="grid gap-2 p-4 md:grid-cols-[10rem_1fr_1fr_auto] md:items-start md:gap-6">
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{attacker}</p>
              <p className="flex gap-2 text-sm">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {result}
              </p>
              {href && <ExtLink href={href}>Log</ExtLink>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ------------------------------------------------------------------ why near

function WhyNear() {
  return (
    <section aria-labelledby="near-heading" className="grid gap-6 md:grid-cols-[1fr_2fr]">
      <h2 id="near-heading" className="font-heading text-xl font-medium">
        Why this needs NEAR
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="font-medium">Function-call access keys</p>
          <p className="text-sm text-muted-foreground">
            The protocol limits the agent's key to one method on one contract. On most chains a key is all-or-nothing,
            so an agent's limits have to live in a wallet contract or an off-chain service.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-medium">Native P-256 verification</p>
          <p className="text-sm text-muted-foreground">
            <code className="font-mono text-foreground">env::p256_verify</code> lets the contract check a phone's
            passkey signature directly. Face ID approval needs no relayer, oracle or signing server.
          </p>
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ live accounts

type LeashView = { account: string; role: string; policy: Policy; stats: Stats; balance: string }

function LiveAccounts({ summary }: { summary: ArenaSummary | null }) {
  const demo = useDemoLeash(config.defaultLeashAccount)
  const rows: LeashView[] = []
  if (summary?.chain) rows.push({ account: summary.leashAccount, role: 'Arena', ...summary.chain })
  if (demo) rows.push({ account: config.defaultLeashAccount, role: 'Demo', ...demo })
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="accounts-heading" className="flex flex-col gap-6">
      <div className="flex max-w-prose flex-col gap-2">
        <h2 id="accounts-heading" className="font-heading text-xl font-medium">
          Live on {config.network}
        </h2>
        <p className="text-muted-foreground">Read from the contracts just now. Check any of it on the explorer.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-normal">Leash</th>
              <th className="px-4 py-2 font-normal">Per payment</th>
              <th className="px-4 py-2 font-normal">Per window</th>
              <th className="px-4 py-2 font-normal">Approved payees</th>
              <th className="px-4 py-2 font-normal">Sent</th>
              <th className="px-4 py-2 font-normal">Held</th>
              <th className="px-4 py-2 font-normal">Rejected</th>
            </tr>
          </thead>
          <tbody className="divide-y font-mono">
            {rows.map(({ account, role, policy, stats }) => (
              <tr key={account}>
                <td className="px-4 py-3">
                  <span className="mr-2 font-sans text-muted-foreground">{role}</span>
                  <ExtLink href={`${config.explorerAccountUrl}${account}`}>{account}</ExtLink>
                </td>
                <td className="px-4 py-3">{near(policy.per_tx_max)} NEAR</td>
                <td className="px-4 py-3">
                  {near(policy.window_max)} NEAR / {Math.round(policy.window_secs / 3600)} h
                </td>
                <td className="px-4 py-3">{policy.allowed_receivers?.length ?? 0}</td>
                <td className="px-4 py-3">{stats.sent}</td>
                <td className="px-4 py-3">{stats.held}</td>
                <td className="px-4 py-3">{stats.rejected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** One read of the demo leash, if one is configured. The landing page doesn't poll it. */
function useDemoLeash(account: string) {
  const [snapshot, setSnapshot] = useState<LeashSnapshot | null>(null)
  useEffect(() => {
    if (!account) return
    readLeash(account).then(setSnapshot, () => setSnapshot(null))
  }, [account])
  return snapshot
}

// ------------------------------------------------------------------ footer

function Footer() {
  return (
    <footer className="flex flex-col gap-3 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>Built at NEAR HACKATHON 2026 for the AI Security & Defense track. Runs on NEAR {config.network}.</p>
      <div className="flex gap-4">
        <a href="/owner" className="hover:text-foreground focus-visible:text-foreground">
          Owner page
        </a>
        {config.repoUrl && <ExtLink href={config.repoUrl}>Source</ExtLink>}
      </div>
    </footer>
  )
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 break-all text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
    >
      {children}
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  )
}

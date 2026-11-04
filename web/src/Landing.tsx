import { ArrowRight, Fingerprint, Plus } from 'lucide-react'
import { HeroDemo } from '@/components/HeroDemo'
import { NearMark } from '@/components/NearMark'
import { Reveal, TaglineReveal } from '@/components/Reveal'
import { PageShell } from '@/components/SiteHeader'
import { outcomeTone, Stamp, type StampTone } from '@/components/Stamp'
import { Button } from '@/components/ui/button'
import { useArenaSummary } from '@/hooks/useArenaSummary'
import type { ArenaChain, ArenaSummary, AttemptRecord } from '@/lib/arena'
import { near, relativeTime } from '@/lib/format'
import { config } from '@/lib/near'
import { cn } from '@/lib/utils'

const repoFile = (path: string) => (config.repoUrl ? `${config.repoUrl}/blob/main/${path}` : null)

/** How many recent arena attempts the proof section lists. */
const FEED_LENGTH = 5
const SECONDS_PER_HOUR = 3600

export default function Landing() {
  const { summary, error } = useArenaSummary()
  return (
    <PageShell>
      <Hero summary={summary} error={error} />
      <Tagline />
      <Layers />
      <Proof summary={summary} error={error} />
      <WhyNear />
      <Faq chain={summary?.chain ?? null} />
      <FinalCta />
    </PageShell>
  )
}

// ------------------------------------------------------------------ hero

function Hero({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  const contract = repoFile('contract/src/lib.rs')
  return (
    <section className="grid items-center gap-12 pt-16 pb-12 md:grid-cols-[1fr_1.1fr] md:pt-24">
      <div className="flex flex-col">
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            Spending rules for AI agents on NEAR
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="heading-gradient mt-6 max-w-[680px] text-balance pb-1 text-4xl font-medium leading-none tracking-tight xl:text-5xl">
            A wallet
            <br />a prompt <span className="whitespace-nowrap">can't empty</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-6 max-w-[680px] text-pretty text-lg text-muted-foreground">
            Your AI agent can ask to pay, but it can't move money on its own. Vendors you approved get paid within your
            limits. Anything else waits until you approve it with Face ID.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 px-4 text-base font-semibold active:scale-[0.98]">
              <a href="/arena">
                Try to rob the agent
                <ArrowRight aria-hidden />
              </a>
            </Button>
            {contract && (
              <Button asChild variant="ghost" size="lg" className="h-11 px-4 text-base font-semibold active:scale-[0.98]">
                <a href={contract} target="_blank" rel="noreferrer">
                  See the code
                </a>
              </Button>
            )}
          </div>
        </Reveal>
        <Reveal delay={320}>
          <LiveStats summary={summary} error={error} />
        </Reveal>
      </div>
      <Reveal delay={200}>
        <HeroDemo />
      </Reveal>
    </section>
  )
}

/** Live numbers from the arena wallet, set apart from the copy as data. */
function LiveStats({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  const chain = summary?.chain
  const stats: [string, string | number, boolean?][] = chain
    ? [
        ['In the wallet', `${near(chain.balance)} NEAR`],
        ['Requests', chain.stats.attempts],
        ['Held', chain.stats.held],
        ['Paid to strangers', summary.strangerPaymentsSent, true],
      ]
    : []
  return (
    <div className="mt-10 border-t pt-6">
      <LiveLabel summary={summary} error={error} />
      {chain && (
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap">
          {stats.map(([label, value, good]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-faint">{label}</dt>
              <dd className={cn('font-mono text-lg', good ? 'text-positive' : 'text-foreground')}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function LiveLabel({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  const chain = summary?.chain
  return (
    <p className="flex items-center gap-2 text-xs text-faint">
      <span className={cn('size-1.5 rounded-full', chain ? 'animate-pulse bg-positive' : 'bg-faint')} aria-hidden />
      {chain ? (
        <span>
          Live from the{' '}
          <a
            href={`${config.explorerAccountUrl}${summary.leashAccount}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
          >
            arena wallet
          </a>
        </span>
      ) : error ? (
        "Can't reach the arena wallet right now"
      ) : (
        'Waking the arena server, up to a minute'
      )}
    </p>
  )
}

// ------------------------------------------------------------------ tagline

function Tagline() {
  return (
    <section aria-label="The idea" className="mx-auto flex max-w-[680px] flex-col py-24 md:max-w-4xl md:py-24">
      <TaglineReveal
        className="text-3xl font-medium leading-tight tracking-tight md:text-4xl"
        lines={[
          [{ text: 'Assume the AI will be fooled.' }],
          [{ text: 'Then the only question is' }, { text: 'what a fooled agent can do.', accent: true }],
        ]}
      />
    </section>
  )
}

// ------------------------------------------------------------------ layers

const LAYERS: { title: string; body: string; fragment: React.ReactNode }[] = [
  {
    title: "The agent's key",
    body: "The agent's key can do one thing: ask for a payment. It can't send money directly, use other apps or change your settings. NEAR blocks all of that.",
    fragment: <KeyFragment />,
  },
  {
    title: 'Your rules',
    body: 'Your rules live on NEAR, not inside the AI. Money goes out only to vendors you approved, and only under your limits. Everything else is held.',
    fragment: <ContractFragment />,
  },
  {
    title: 'You',
    body: 'Held payments wait for your Face ID or fingerprint. NEAR checks your approval itself, so no company or server can approve for you.',
    fragment: <ApprovalFragment />,
  },
]

function Layers() {
  return (
    <Section
      title="Three checks. None of them listens to the AI."
      lead="Even a tricked agent can only ask to pay. Here is what decides whether the money moves."
    >
      <ol className="grid gap-4 md:grid-cols-3">
        {LAYERS.map(({ title, body, fragment }, i) => (
          <li key={title}>
            <Reveal delay={i * 100} className="h-full">
              <div className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-2 transition-colors duration-300 hover:border-foreground/20">
                <div className="flex min-h-44 flex-col justify-center rounded-lg border bg-background p-4">{fragment}</div>
                <div className="flex flex-col gap-2 px-4 pb-4">
                  <p className="flex items-baseline gap-3">
                    <span className="font-mono text-sm text-warning">0{i + 1}</span>
                    <span className="font-medium">{title}</span>
                  </p>
                  <p className="text-pretty text-muted-foreground">{body}</p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
      <Reveal>
        <p className="max-w-[680px] text-pretty text-sm text-faint">
          One honest limit: a payment to a vendor you approved, inside your limits, goes out without asking. That is
          what an allowance is. Your total limit for each period caps what a tricked agent can lose that way.
        </p>
      </Reveal>
    </Section>
  )
}

function KeyFragment() {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <dl className="grid grid-cols-[4rem_1fr] gap-y-1">
        <dt className="text-faint">Can</dt>
        <dd className="text-warning">Ask for a payment</dd>
        <dt className="text-faint">Can't</dt>
        <dd>Send money directly</dd>
        <dt className="text-faint">Can't</dt>
        <dd>Use other apps or add keys</dd>
      </dl>
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-muted-foreground">Send 4.75 NEAR directly</span>
        <Stamp tone="neutral">Rejected by NEAR</Stamp>
      </div>
    </div>
  )
}

const CONTRACT_ROWS: { amount: string; to: string; tone: StampTone; verdict: string }[] = [
  { amount: '0.12', to: 'vendor.testnet', tone: 'sent', verdict: 'Sent' },
  { amount: '0.08', to: 'mallory.testnet', tone: 'held', verdict: 'Held' },
  { amount: '4.75', to: 'vendor.testnet', tone: 'held', verdict: 'Held' },
]

function ContractFragment() {
  return (
    <ul className="flex flex-col gap-2 font-mono text-xs">
      {CONTRACT_ROWS.map(({ amount, to, tone, verdict }) => (
        <li key={`${amount}${to}`} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">
            {amount} <span className="text-faint">→</span> <span className="text-muted-foreground">{to}</span>
          </span>
          <Stamp tone={tone}>{verdict}</Stamp>
        </li>
      ))}
    </ul>
  )
}

function ApprovalFragment() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Fingerprint className="size-6 text-warning" strokeWidth={1.5} aria-hidden />
      <p className="text-sm">
        Send <span className="font-mono">4.75 NEAR</span> to <span className="font-mono">vendor.testnet</span>?
      </p>
      <p className="text-xs text-faint">Over your per-payment limit</p>
      <div className="flex gap-2" aria-hidden>
        <span className="rounded-md border px-3 py-1 text-xs text-muted-foreground">Reject</span>
        <span className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Approve</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ proof

const ATTACKS: { title: string; tries: string; tone: StampTone; outcome: string; log: string }[] = [
  {
    title: 'Hidden instructions',
    tries: 'Fake payment orders hidden in a vendor invoice, tried three ways, on a careful AI and a jailbroken one',
    tone: 'held',
    outcome: 'Held',
    log: 'agent/attacks/logs/01-prompt-injection.log',
  },
  {
    title: 'Many small payments',
    tries: 'A hacked agent skips the AI and sends lots of small payments, each under the per-payment limit',
    tone: 'held',
    outcome: 'Held at the total limit',
    log: 'agent/attacks/logs/02-drip-drain.log',
  },
  {
    title: 'Stolen key',
    tries: "Someone uses the agent's key directly: to send money, use another app, change owner settings or add a key",
    tone: 'neutral',
    outcome: 'Blocked by NEAR',
    log: 'agent/attacks/logs/03-key-misuse.log',
  },
]

function Proof({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  return (
    <Section
      title="Proof, not promises"
      lead="We ran three attacks against a live wallet, and anyone can email the arena agent to try their own. Every result is public on NEAR."
    >
      <div className="grid items-start gap-4 md:grid-cols-[1fr_1.2fr]">
        <ul className="flex flex-col gap-4">
          {ATTACKS.map(({ title, tries, tone, outcome, log }, i) => {
            const href = repoFile(log)
            return (
              <li key={title}>
                <Reveal delay={i * 100}>
                  <div className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{title}</p>
                      <Stamp tone={tone}>{outcome}</Stamp>
                    </div>
                    <p className="text-pretty text-sm text-muted-foreground">{tries}</p>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="self-start text-sm text-muted-foreground underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
                      >
                        Read the log
                      </a>
                    )}
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ul>
        <Reveal delay={100}>
          <ArenaFeed summary={summary} error={error} />
        </Reveal>
      </div>
    </Section>
  )
}

function ArenaFeed({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  const recent = summary?.recent.slice(0, FEED_LENGTH) ?? []
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-medium">Latest arena attempts</p>
        <LiveLabel summary={summary} error={error} />
      </div>
      {!summary ? (
        <ul className="flex flex-col gap-3" aria-label="Loading">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </ul>
      ) : recent.length === 0 ? (
        <p className="text-balance rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nobody has tried since the arena server last started. Yours would be the first attempt on this list.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {recent.map((record) => (
            <FeedRow key={record.id} record={record} />
          ))}
        </ul>
      )}
      <a
        href="/arena"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
      >
        Open the arena
        <ArrowRight className="size-3.5" aria-hidden />
      </a>
    </div>
  )
}

function FeedRow({ record }: { record: AttemptRecord }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0">
      <div className="min-w-0">
        <p className="truncate text-sm">
          <span className="font-mono">{record.handle}</span>{' '}
          <span className="text-faint">{record.mode === 'jailbroken' ? 'vs jailbroken AI' : 'vs guarded AI'}</span>
        </p>
        <p className="text-xs text-faint">
          {record.fooled ? 'AI fooled' : 'AI refused'} · {relativeTime(Date.parse(record.at))}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {record.pays.length === 0 ? (
          <Stamp tone="neutral">No payment</Stamp>
        ) : (
          record.pays.map((pay, i) => (
            <Stamp key={i} tone={outcomeTone(pay.outcome)}>
              {pay.amountNear} {pay.outcome}
            </Stamp>
          ))
        )}
      </div>
    </li>
  )
}

// ------------------------------------------------------------------ why near

const NEAR_FEATURES = [
  {
    title: 'Keys with limits built in',
    body: "On NEAR, a key can be limited to a single action, so the agent's key can only ask for a payment. On most blockchains a key can do everything, and the limits need extra software that can break.",
    feature: 'Function call access keys',
  },
  {
    title: 'Face ID checked by NEAR itself',
    body: "NEAR can check your phone's Face ID or fingerprint approval directly. No middleman server sits between you and your money.",
    feature: 'Native P-256 passkey verification (env::p256_verify)',
  },
]

function WhyNear() {
  return (
    <Section title="Why this needs NEAR" mark={<NearMark className="size-6 shrink-0" />}>
      <div className="grid gap-4 md:grid-cols-2">
        {NEAR_FEATURES.map(({ title, body, feature }, i) => (
          <Reveal key={title} delay={i * 100} className="h-full min-w-0">
            <div className="flex h-full flex-col gap-2 rounded-2xl border bg-card p-6">
              <p className="font-medium">{title}</p>
              <p className="text-pretty text-muted-foreground">{body}</p>
              <p className="mt-auto pt-2 text-xs text-faint">NEAR feature: {feature}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

// ------------------------------------------------------------------ faq

function faqs(chain: ArenaChain | null): { q: string; a: string }[] {
  const windowCap = chain
    ? ` On the arena wallet that is ${near(chain.policy.window_max)} NEAR every ${chain.policy.window_secs / SECONDS_PER_HOUR} hours.`
    : ''
  return [
    {
      q: 'Can a tricked agent drain the wallet by paying an approved vendor?',
      a: `Only up to your total limit. Payments to an approved vendor inside your limits go out without asking. Anything past that waits for you.${windowCap}`,
    },
    {
      q: 'What if the AI is fully jailbroken?',
      a: 'Nothing changes. The arena has a Jailbroken AI mode with its safety training removed. It agrees to pay attackers, and every one of those payments is held.',
    },
    {
      q: "What if someone steals the agent's key?",
      a: "They get exactly what the agent has: the right to ask for a payment. The key can't send NEAR, use another app or add new keys. NEAR blocks all of that before your rules even run.",
    },
    {
      q: 'Who can approve a held payment?',
      a: "Only you, with your phone's Face ID or fingerprint. NEAR checks the approval itself, checks it came from this site, and never accepts the same approval twice.",
    },
    {
      q: 'Does a server hold a key that can move money?',
      a: "No. The demo wallets have no full-access key at all. One key can only ask for payments, and the other can only send approvals that each fail without a fresh Face ID or fingerprint from you. A small relay can pay the network fee for an approval, but it holds no key on either wallet.",
    },
    {
      q: 'Is this on mainnet?',
      a: 'Not yet. Everything runs on NEAR testnet, so no real funds are at risk while you try to break it.',
    },
    {
      q: 'Can I run my own wallet?',
      a: 'Yes. Set up Face ID on the owner page, run the setup script from the code, and give your agent the key it prints. The README walks through every step.',
    },
  ]
}

function Faq({ chain }: { chain: ArenaChain | null }) {
  return (
    <Section title="Hard questions, straight answers">
      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        {faqs(chain).map(({ q, a }) => (
          <details key={q} className="group px-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-4 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              {q}
              <Plus
                className="size-4 shrink-0 text-faint transition-transform duration-300 ease-(--ease-fluid) group-open:rotate-45"
                aria-hidden
              />
            </summary>
            <p className="max-w-[680px] pb-6 text-pretty text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

// ------------------------------------------------------------------ final cta

function FinalCta() {
  return (
    <Reveal>
      <section
        aria-labelledby="final-cta"
        className="mt-16 flex flex-col items-center gap-6 rounded-2xl border bg-card px-6 py-16 text-center"
      >
        <h2 id="final-cta" className="max-w-[680px] text-balance text-2xl font-medium tracking-tight md:text-3xl">
          Your turn. Try to talk the agent into paying you.
        </h2>
        <p className="max-w-[680px] text-pretty text-muted-foreground">
          Even if you fool the AI, you will watch the payment get held instead of sent.
        </p>
        <Button asChild size="lg" className="h-11 px-4 text-base font-semibold active:scale-[0.98]">
          <a href="/arena">
            Try to rob the agent
            <ArrowRight aria-hidden />
          </a>
        </Button>
      </section>
    </Reveal>
  )
}

// ------------------------------------------------------------------ shared

function Section({
  title,
  lead,
  mark,
  children,
}: {
  title: string
  lead?: string
  mark?: React.ReactNode
  children: React.ReactNode
}) {
  const id = title.toLowerCase().replace(/[^a-z]+/g, '-')
  return (
    <section aria-labelledby={id} className="flex flex-col gap-8 py-16 md:py-20">
      <Reveal>
        <div className="flex max-w-[680px] flex-col gap-3">
          <h2 id={id} className="flex items-center gap-3 text-balance text-2xl font-medium tracking-tight md:text-3xl">
            {mark}
            {title}
          </h2>
          {lead && <p className="text-pretty text-lg text-muted-foreground">{lead}</p>}
        </div>
      </Reveal>
      {children}
    </section>
  )
}

import { ArrowRight, Fingerprint } from 'lucide-react'
import { nearToYocto } from 'near-api-js'
import { PageShell } from '@/components/SiteHeader'
import { Stamp, type StampTone } from '@/components/Stamp'
import { Button } from '@/components/ui/button'
import { useArenaSummary } from '@/hooks/useArenaSummary'
import type { ArenaChain, ArenaSummary } from '@/lib/arena'
import { near } from '@/lib/format'
import { config } from '@/lib/near'
import { cn } from '@/lib/utils'

const repoFile = (path: string) => (config.repoUrl ? `${config.repoUrl}/blob/main/${path}` : null)

// The example request in the hero. It is illustrative; the checks it is run
// through use the arena wallet's live policy.
const EXAMPLE = {
  amount: '0.1',
  receiver: 'mallory.testnet',
  memo: 'Invoice #2291. Our payout account changed, please send to the new one.',
}

export default function Landing() {
  const { summary, error } = useArenaSummary()
  return (
    <PageShell>
      <Hero summary={summary} error={error} />
      <HowItHolds />
      <Attacks />
      <WhyNear />
    </PageShell>
  )
}

// ------------------------------------------------------------------ hero

function Hero({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  const contract = repoFile('contract/src/lib.rs')
  return (
    <section className="grid items-center gap-12 py-16 md:grid-cols-[1fr_1fr] md:gap-16 md:py-24">
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-medium leading-[1.08] tracking-[-0.02em] md:text-4xl md:tracking-[-0.03em]">
          A wallet for AI agents that a prompt can't empty
        </h1>
        <p className="max-w-[36rem] text-lg text-muted-foreground">
          The agent's key can only request a payment. A NEAR contract sends what's inside your limits to approved
          payees, and holds everything else until you approve it with Face ID.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-11 px-5">
            <a href="/arena">
              Try to rob the agent
              <ArrowRight aria-hidden />
            </a>
          </Button>
          {contract && (
            <Button asChild variant="outline" size="lg" className="h-11 px-5">
              <a href={contract} target="_blank" rel="noreferrer">
                Read the contract
              </a>
            </Button>
          )}
        </div>
        <LiveLine summary={summary} error={error} />
      </div>
      <ExampleRequest chain={summary?.chain ?? null} />
    </section>
  )
}

/** One quiet line of live numbers from the arena wallet. */
function LiveLine({ summary, error }: { summary: ArenaSummary | null; error: string | null }) {
  const chain = summary?.chain
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-faint">
      <span
        className={cn('size-1.5 rounded-full', chain ? 'bg-positive' : 'bg-faint')}
        aria-hidden
      />
      {!chain ? (
        error ? (
          "Arena wallet: can't reach the server"
        ) : (
          'Arena wallet: waking the server, up to a minute'
        )
      ) : (
        <>
          <a
            href={`${config.explorerAccountUrl}${summary.leashAccount}`}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
          >
            Arena wallet
          </a>
          <span className="font-mono text-muted-foreground">{near(chain.balance)} NEAR</span>
          <span aria-hidden>·</span>
          <span>
            <span className="font-mono text-muted-foreground">{chain.stats.attempts}</span>{' '}
            {chain.stats.attempts === 1 ? 'request' : 'requests'}
          </span>
          <span aria-hidden>·</span>
          <span>
            <span className="font-mono text-muted-foreground">{chain.stats.held}</span> held
          </span>
          <span aria-hidden>·</span>
          <span>
            <span className="font-mono text-muted-foreground">{summary.strangerPaymentsSent}</span> paid to strangers
          </span>
        </>
      )}
    </p>
  )
}

/** The hero's one rich element: a payment request as the owner sees it, run through the live policy. */
function ExampleRequest({ chain }: { chain: ArenaChain | null }) {
  const amount = BigInt(nearToYocto(EXAMPLE.amount as `${number}`))
  const policy = chain?.policy
  const checks: { label: string; pass: boolean | null }[] = [
    {
      label: 'On the approved payee list',
      pass: policy ? (policy.allowed_receivers ?? []).includes(EXAMPLE.receiver) : null,
    },
    {
      label: policy ? `Under ${near(policy.per_tx_max)} NEAR per payment` : 'Under the per-payment cap',
      pass: policy ? amount <= BigInt(policy.per_tx_max) : null,
    },
    {
      label: chain ? `Within ${near(chain.window.remaining)} NEAR left in the window` : 'Within the window cap',
      pass: chain ? amount <= BigInt(chain.window.remaining) : null,
    },
  ]
  const held = checks.some((c) => c.pass === false)
  const tone: StampTone = !chain ? 'neutral' : held ? 'held' : 'sent'

  return (
    <figure className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <span className="text-sm text-muted-foreground">Payment request</span>
          <Stamp tone={tone}>{!chain ? 'Checking' : held ? 'Held for the owner' : 'Sent'}</Stamp>
        </div>
        <div className="flex flex-col gap-1 px-5 pt-4">
          <p className="font-mono text-2xl font-medium leading-none">{EXAMPLE.amount} NEAR</p>
          <p className="font-mono text-sm text-muted-foreground">to {EXAMPLE.receiver}</p>
        </div>
        <div className="mx-5 mt-4 rounded-md bg-muted px-3 py-2">
          <p className="text-xs text-faint">Agent's note</p>
          <p className="font-mono text-sm text-muted-foreground">{EXAMPLE.memo}</p>
        </div>

        <ul className="mt-5 border-t">
          {checks.map(({ label, pass }) => (
            <li key={label} className="flex h-10 items-center justify-between gap-4 border-b px-5 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span
                className={cn(
                  'font-mono',
                  pass === null ? 'text-faint' : pass ? 'text-foreground' : 'text-warning',
                )}
              >
                {pass === null ? '…' : pass ? 'yes' : 'no'}
              </span>
            </li>
          ))}
        </ul>

        {/* What the owner's phone shows. Illustrative, so not real buttons. */}
        <div className="flex flex-col gap-3 bg-background/40 p-5" aria-hidden>
          <div className="grid grid-cols-2 gap-3">
            <span className="flex h-10 items-center justify-center rounded-md border bg-secondary text-sm">
              Reject
            </span>
            <span className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground">
              <Fingerprint className="size-4" strokeWidth={1.5} />
              Approve
            </span>
          </div>
        </div>
      </div>
      <figcaption className="text-sm text-faint">
        An example request, checked against the arena wallet's live policy. Approving needs the owner's passkey;
        the contract verifies the signature itself.
      </figcaption>
    </figure>
  )
}

// ------------------------------------------------------------------ how it holds

const LAYERS = [
  {
    title: 'The key',
    body: 'The agent signs with a NEAR function-call key that can only call agent_spend on its own account. NEAR rejects anything else before the contract runs.',
  },
  {
    title: 'The contract',
    body: 'agent_spend sends a payment only to an approved payee, and only inside the per-payment and per-window caps. Everything else is held and counted.',
  },
  {
    title: 'You',
    body: 'Held payments wait for your Face ID or fingerprint. The contract checks the passkey signature itself, so no server can approve for you.',
  },
]

function HowItHolds() {
  return (
    <Section title="What a fooled agent can do" lead="Request a payment, and nothing else. Three layers decide what happens next, and none of them reads the prompt.">
      <ol className="grid border-y md:grid-cols-3 md:divide-x">
        {LAYERS.map(({ title, body }, i) => (
          <li key={title} className="flex flex-col gap-2 border-b py-6 last:border-b-0 md:border-b-0 md:px-6 md:first:pl-0 md:last:pr-0">
            <p className="flex items-baseline gap-3">
              <span className="font-mono text-sm text-faint">{i + 1}</span>
              <span className="font-medium">{title}</span>
            </p>
            <p className="text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <p className="max-w-[40rem] text-sm text-faint">
        The limit, stated plainly: a payment to an approved payee inside the caps goes out without asking. That is what
        an allowance is. The window cap bounds what a fooled agent can lose that way.
      </p>
    </Section>
  )
}

// ------------------------------------------------------------------ attacks

const ATTACKS: { title: string; tries: string; tone: StampTone; outcome: string; log: string }[] = [
  {
    title: 'Prompt injection',
    tries: 'Instructions hidden in a vendor invoice, in three styles, against a guarded and a jailbroken model',
    tone: 'held',
    outcome: 'Held',
    log: 'agent/attacks/logs/01-prompt-injection.log',
  },
  {
    title: 'Drip drain',
    tries: 'A compromised agent skips the model and sends many small payments, each under the per-payment cap',
    tone: 'held',
    outcome: 'Held at the window cap',
    log: 'agent/attacks/logs/02-drip-drain.log',
  },
  {
    title: 'Key misuse',
    tries: 'The agent key used directly: a raw transfer, another contract, an owner method, a new key',
    tone: 'neutral',
    outcome: 'Blocked by NEAR',
    log: 'agent/attacks/logs/03-key-misuse.log',
  },
]

function Attacks() {
  return (
    <Section title="Attacked on testnet" lead="Three scripts run against a live wallet. Each log lists every transaction with an explorer link.">
      <ul className="border-y">
        {ATTACKS.map(({ title, tries, tone, outcome, log }) => {
          const href = repoFile(log)
          return (
            <li
              key={title}
              className="grid gap-3 border-b py-5 last:border-b-0 md:grid-cols-[11rem_1fr_13rem_3rem] md:items-center md:gap-6"
            >
              <p className="font-medium">{title}</p>
              <p className="text-muted-foreground">{tries}</p>
              <Stamp tone={tone} className="justify-self-start">
                {outcome}
              </Stamp>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline md:justify-self-end"
                >
                  Log
                </a>
              ) : (
                <span />
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

// ------------------------------------------------------------------ why near

function WhyNear() {
  return (
    <Section title="Why this needs NEAR">
      <div className="grid gap-8 md:grid-cols-2 md:gap-16">
        <div className="flex flex-col gap-2">
          <p className="font-medium">Function-call access keys</p>
          <p className="text-muted-foreground">
            The protocol limits the agent's key to one method on one contract. On most chains a key is all or nothing,
            so an agent's limits have to live in a wallet contract or an off-chain service.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-medium">Native P-256 verification</p>
          <p className="text-muted-foreground">
            <code className="font-mono text-sm text-foreground">env::p256_verify</code> lets the contract check a
            phone's passkey signature directly. Face ID approval needs no relayer, oracle or signing server.
          </p>
        </div>
      </div>
    </Section>
  )
}

// ------------------------------------------------------------------ shared

function Section({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  const id = title.toLowerCase().replace(/[^a-z]+/g, '-')
  return (
    <section aria-labelledby={id} className="flex flex-col gap-8 py-16 md:py-20">
      <div className="flex max-w-[40rem] flex-col gap-2">
        <h2 id={id} className="text-2xl font-medium tracking-[-0.01em]">
          {title}
        </h2>
        {lead && <p className="text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

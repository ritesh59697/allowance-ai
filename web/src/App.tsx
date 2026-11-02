import { Bell, ExternalLink, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AgentKeys } from '@/components/AgentKeys'
import { PendingCard } from '@/components/PendingCard'
import { Setup } from '@/components/Setup'
import { WindowMeter } from '@/components/WindowMeter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useLeash } from '@/hooks/useLeash'
import { near } from '@/lib/format'
import {
  challengeFor,
  config,
  relayKeyPair,
  submitOwnerAction,
  type OwnerAction,
  type Stats,
} from '@/lib/near'
import { load, save } from '@/lib/storage'
import { registerPasskey, signChallenge, type RegisteredPasskey } from '@/lib/webauthn'

const PASSKEY_KEY = 'leash.passkey'
const ACCOUNT_KEY = 'leash.account'

export default function App() {
  const [passkey, setPasskey] = useState(() => load<RegisteredPasskey>(PASSKEY_KEY))
  const [account, setAccount] = useState(() => load<string>(ACCOUNT_KEY) ?? config.defaultLeashAccount)
  const [registering, setRegistering] = useState(false)
  const [busy, setBusy] = useState<{ target: string; kind: OwnerAction['action'] } | null>(null)
  const relayPublicKey = useMemo(() => relayKeyPair().getPublicKey().toString(), [])
  const { snapshot, error, refresh } = useLeash(passkey ? account : '')

  const isOwner = !!passkey && !!snapshot && snapshot.owner.public_key === passkey.publicKey
  const disabledReason = !snapshot
    ? 'Loading the leash…'
    : isOwner
      ? null
      : "This device's passkey is not the owner of this leash."

  async function register() {
    setRegistering(true)
    try {
      const created = await registerPasskey(config.rpId, `leash owner ${new Date().toLocaleDateString()}`)
      save(PASSKEY_KEY, created)
      setPasskey(created)
    } catch (e) {
      toast.error(message(e))
    } finally {
      setRegistering(false)
    }
  }

  function changeAccount(next: string) {
    setAccount(next)
    save(ACCOUNT_KEY, next)
  }

  async function act(action: OwnerAction, target: string, success: string) {
    if (!passkey) return
    setBusy({ target, kind: action.action })
    try {
      const challenge = await challengeFor(account, action)
      const assertion = await signChallenge(passkey, challenge)
      const hash = await submitOwnerAction(account, action, assertion)
      toast.success(success, {
        action: { label: 'View tx', onClick: () => window.open(`${config.explorerTxUrl}${hash}`, '_blank') },
      })
      await refresh()
    } catch (e) {
      toast.error(message(e))
    } finally {
      setBusy(null)
    }
  }

  // Stay on setup until the leash at `account` is owned by this device's passkey,
  // so the keys to deploy with stay on screen.
  const ready = passkey && account && snapshot && isOwner

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 pb-16 pt-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
          <span className="font-heading font-medium">Haptix Leash</span>
        </div>
        <Badge variant="outline" className="font-mono uppercase">
          {config.network}
        </Badge>
      </header>

      {!ready ? (
        <>
          <Setup
            passkey={passkey}
            relayPublicKey={relayPublicKey}
            account={account}
            onAccountChange={changeAccount}
            onRegister={register}
            registering={registering}
          />
          {passkey && account && error && (
            <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
              Can't read <span className="font-mono">{account}</span>: {shortError(error)}
            </p>
          )}
          {passkey && account && snapshot && !isOwner && (
            <p role="alert" className="rounded-md border border-warning/40 px-3 py-2 text-sm text-warning">
              <span className="font-mono">{account}</span> is owned by a different passkey. Deploy a leash with the keys
              above, then enter that account.
            </p>
          )}
        </>
      ) : (
        <main className="flex flex-col gap-10">
          <div className="flex flex-col gap-1">
            <a
              href={`${config.explorerAccountUrl}${account}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 self-start font-mono text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground"
            >
              {account}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <p className="text-sm text-muted-foreground">Balance {near(snapshot.balance)} NEAR</p>
          </div>

          {!isOwner && (
            <p role="alert" className="rounded-md border border-warning/40 px-3 py-2 text-sm text-warning">
              {disabledReason}
            </p>
          )}

          <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 id="pending-heading" className="text-xs uppercase tracking-wider text-muted-foreground">
                Waiting for you
              </h2>
              <NotifyButton />
            </div>
            {snapshot.pending.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing held. Your agent is inside its limits.
              </p>
            ) : (
              snapshot.pending.map((request) => (
                <PendingCard
                  key={request.id}
                  request={request}
                  busy={busy?.target === request.id ? (busy.kind as 'approve' | 'reject') : null}
                  disabledReason={busy && busy.target !== request.id ? 'Finish the other approval first.' : disabledReason}
                  onApprove={() =>
                    act({ action: 'approve', id: request.id }, request.id, `Sent ${near(request.amount)} NEAR`)
                  }
                  onReject={() => act({ action: 'reject', id: request.id }, request.id, 'Rejected. Nothing was sent.')}
                />
              ))
            )}
          </section>

          <WindowMeter window={snapshot.window} policy={snapshot.policy} />

          <StatsRow stats={snapshot.stats} />

          <AgentKeys
            keys={snapshot.agentKeys}
            busyKey={busy?.kind === 'revoke_agent_key' ? busy.target : null}
            disabledReason={disabledReason}
            onRevoke={(publicKey) =>
              act({ action: 'revoke_agent_key', public_key: publicKey }, publicKey, 'Agent key revoked')
            }
          />
        </main>
      )}
      <Toaster position="top-center" />
    </div>
  )
}

function StatsRow({ stats }: { stats: Stats }) {
  const items = [
    ['Attempts', stats.attempts],
    ['Sent', stats.sent],
    ['Held', stats.held],
    ['Rejected', stats.rejected],
  ] as const
  return (
    <section aria-label="Agent activity">
      <dl className="grid grid-cols-4 divide-x rounded-md border">
        {items.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-mono text-lg">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function NotifyButton() {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied')
  if (!supported || permission === 'granted' || permission === 'denied') return null
  return (
    <Button variant="ghost" size="sm" onClick={async () => setPermission(await Notification.requestPermission())}>
      <Bell aria-hidden />
      Alert me
    </Button>
  )
}

function message(e: unknown) {
  const text = e instanceof Error ? e.message : String(e)
  if (text.includes('NotAllowedError') || text.includes('not allowed')) return 'Passkey prompt was dismissed.'
  return shortError(text)
}

function shortError(text: string) {
  return text.length > 180 ? `${text.slice(0, 180)}…` : text
}

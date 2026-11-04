import { Bell, ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AgentKeys } from '@/components/AgentKeys'
import { OwnerControls } from '@/components/OwnerControls'
import { PendingCard } from '@/components/PendingCard'
import { Setup } from '@/components/Setup'
import { PageShell } from '@/components/SiteHeader'
import { WindowMeter } from '@/components/WindowMeter'
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
    ? 'Loading the wallet…'
    : isOwner
      ? null
      : "This device's passkey is not the owner of this wallet."

  async function register() {
    setRegistering(true)
    try {
      const created = await registerPasskey(config.rpId, `Allowance owner ${new Date().toLocaleDateString()}`)
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

  /** Sign `action` with the passkey and submit it. Resolves true once it lands. */
  async function act(action: OwnerAction, target: string, success: string): Promise<boolean> {
    if (!passkey) return false
    setBusy({ target, kind: action.action })
    try {
      const challenge = await challengeFor(account, action)
      const assertion = await signChallenge(passkey, challenge)
      const hash = await submitOwnerAction(account, action, assertion)
      toast.success(success, {
        action: { label: 'View tx', onClick: () => window.open(`${config.explorerTxUrl}${hash}`, '_blank') },
      })
      await refresh()
      return true
    } catch (e) {
      toast.error(message(e))
      return false
    } finally {
      setBusy(null)
    }
  }

  // Stay on setup until the leash at `account` is owned by this device's passkey,
  // so the keys to deploy with stay on screen.
  const ready = passkey && account && snapshot && isOwner

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-10 py-12 md:py-16">

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
              <span className="font-mono">{account}</span> is owned by a different passkey. Deploy a wallet with the keys
              above, then enter that account.
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-medium leading-[1.1] tracking-[-0.02em]">Your agent's wallet</h1>
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
            <Button variant="link" size="sm" className="self-start px-0" onClick={() => changeAccount('')}>
              Switch wallet
            </Button>
          </div>

          {!isOwner && (
            <p role="alert" className="rounded-md border border-warning/40 px-3 py-2 text-sm text-warning">
              {disabledReason}
            </p>
          )}

          <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="pending-heading" className="font-medium">
                Waiting for you
              </h2>
              <div className="flex items-center gap-1">
                {snapshot.pending.length > 1 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy !== null || disabledReason !== null}
                    onClick={() =>
                      act(
                        { action: 'reject_all', count: snapshot.pending.length },
                        'all',
                        `Rejected ${snapshot.pending.length} requests. Nothing was sent.`,
                      )
                    }
                  >
                    {busy?.target === 'all' ? 'Rejecting…' : `Reject all ${snapshot.pending.length}`}
                  </Button>
                )}
                {isOwner && <NotifyButton />}
              </div>
            </div>
            {snapshot.pending.length === 0 ? (
              <p className="rounded-xl border px-5 py-8 text-muted-foreground">
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
            adding={busy?.kind === 'add_agent_key'}
            disabledReason={disabledReason}
            onRevoke={(publicKey) =>
              act({ action: 'revoke_agent_key', public_key: publicKey }, publicKey, 'Agent key revoked')
            }
            onAdd={(publicKey, allowance) =>
              act({ action: 'add_agent_key', public_key: publicKey, allowance }, 'add_agent_key', 'Agent key added')
            }
          />

          <OwnerControls
            policy={snapshot.policy}
            available={snapshot.available}
            busyTarget={busy?.kind === 'withdraw' || busy?.kind === 'set_policy' ? busy.target : null}
            disabledReason={busy ? 'Finish the other approval first.' : disabledReason}
            onAct={act}
          />
        </div>
      )}
      </div>
      <Toaster position="top-center" />
    </PageShell>
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
      <dl className="grid grid-cols-4 divide-x rounded-xl border bg-card">
        {items.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xl">{value}</dd>
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

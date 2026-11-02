import { Check, Copy, Fingerprint } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { OWNER_METHODS, config } from '@/lib/near'
import { cn } from '@/lib/utils'
import type { RegisteredPasskey } from '@/lib/webauthn'

type Props = {
  passkey: RegisteredPasskey | null
  relayPublicKey: string
  account: string
  onAccountChange: (account: string) => void
  onRegister: () => void
  registering: boolean
}

/** First run: create the owner passkey and hand its key to the deploy script. */
export function Setup({ passkey, relayPublicKey, account, onAccountChange, onRegister, registering }: Props) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-medium leading-[1.1] tracking-[-0.02em]">Owner</h1>
        <p className="text-lg text-muted-foreground">
          Your agent spends small amounts on its own. Anything outside your rules waits here until you approve or
          reject it with Face ID or a fingerprint.
        </p>
        <p className="text-sm text-faint">
          The demo wallets belong to the developer's phone, so you can watch them but not approve.{' '}
          <a href="/arena" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Try the arena
          </a>{' '}
          instead, or set up your own wallet below.
        </p>
      </div>

      <ol className="flex flex-col border-y">
        <Step n={1} title="Create the owner passkey on this device" done={!!passkey}>
          {passkey ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-4 text-positive" strokeWidth={1.5} aria-hidden />
              Passkey created for <span className="font-mono">{passkey.rpId}</span>
            </p>
          ) : (
            <Button size="lg" className="h-11 self-start px-5" onClick={onRegister} disabled={registering}>
              <Fingerprint strokeWidth={1.5} aria-hidden />
              {registering ? 'Waiting for your device…' : 'Create passkey'}
            </Button>
          )}
        </Step>

        <Step n={2} title="Deploy a wallet with these keys" disabled={!passkey}>
          {passkey && (
            <>
              <CopyField label="Owner passkey (P-256)" value={passkey.publicKey} />
              <CopyField
                label={`Relay key, may only call the ${OWNER_METHODS.length} passkey-gated methods`}
                value={relayPublicKey}
              />
              <p className="text-sm text-muted-foreground">
                Put both in <code className="font-mono text-foreground">scripts/.env</code> as{' '}
                <code className="font-mono text-foreground">OWNER_PASSKEY_PUBLIC_KEY</code> and{' '}
                <code className="font-mono text-foreground">OWNER_RELAY_PUBLIC_KEY</code>, then run{' '}
                <code className="font-mono text-foreground">node --env-file=.env deploy.mjs</code>
              </p>
            </>
          )}
        </Step>

        <Step n={3} title="Open your wallet" disabled={!passkey}>
          {passkey && (
            <div className="flex flex-col gap-2">
              <label htmlFor="account" className="text-sm text-muted-foreground">
                Wallet account on {config.network}
              </label>
              <input
                id="account"
                value={account}
                onChange={(e) => onAccountChange(e.target.value.trim())}
                placeholder={`my-agent.${config.network}`}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 rounded-md border border-input bg-card px-3 font-mono text-sm outline-none transition-colors duration-150 placeholder:text-faint focus-visible:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/20"
              />
            </div>
          )}
        </Step>
      </ol>
    </div>
  )
}

function Step({
  n,
  title,
  done,
  disabled,
  children,
}: {
  n: number
  title: string
  done?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-x-3 border-b py-6 last:border-b-0">
      <span className={cn('font-mono text-sm', done ? 'text-positive' : 'text-faint')}>{n}</span>
      <div className="flex min-w-0 flex-col gap-4">
        <h2 className={cn('font-medium', disabled && 'text-faint')}>{title}</h2>
        {children}
      </div>
    </li>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-md border bg-card py-1 pl-3 pr-1">
        <code className="min-w-0 flex-1 truncate font-mono text-sm" title={value}>
          {value}
        </code>
        <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check strokeWidth={1.5} aria-hidden /> : <Copy strokeWidth={1.5} aria-hidden />}
        </Button>
      </div>
    </div>
  )
}

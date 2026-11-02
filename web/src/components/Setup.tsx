import { Check, Copy, Fingerprint } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { OWNER_METHODS } from '@/lib/near'
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-xl font-medium">Put your agent on a leash</h1>
        <p className="text-muted-foreground">
          Your agent spends small amounts on its own. Anything bigger waits here until you approve it with Face ID or
          your fingerprint. The rules live in a NEAR contract, not on a server.
        </p>
      </div>

      <ol className="flex flex-col gap-6">
        <li className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">1. Create the owner passkey on this device</h2>
          {passkey ? (
            <p className="flex items-center gap-2 text-sm text-primary">
              <Check className="size-4" aria-hidden /> Passkey created for {passkey.rpId}
            </p>
          ) : (
            <Button size="lg" className="h-11 self-start" onClick={onRegister} disabled={registering}>
              <Fingerprint aria-hidden />
              {registering ? 'Waiting for your device…' : 'Create passkey'}
            </Button>
          )}
        </li>

        {passkey && (
          <li className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">2. Deploy the leash with these keys</h2>
            <CopyField label="Owner passkey (P-256)" value={passkey.publicKey} />
            <CopyField
              label={`Relay key (may only call ${OWNER_METHODS.length} passkey-gated methods)`}
              value={relayPublicKey}
            />
            <p className="text-sm text-muted-foreground">
              Put both in <code className="font-mono text-foreground">scripts/.env</code> as{' '}
              <code className="font-mono text-foreground">OWNER_PASSKEY_PUBLIC_KEY</code> and{' '}
              <code className="font-mono text-foreground">OWNER_RELAY_PUBLIC_KEY</code>, then run{' '}
              <code className="font-mono text-foreground">node --env-file=.env deploy.mjs</code>.
            </p>
          </li>
        )}

        {passkey && (
          <li className="flex flex-col gap-3">
            <label htmlFor="account" className="text-sm font-medium">
              3. Leash account
            </label>
            <input
              id="account"
              value={account}
              onChange={(e) => onAccountChange(e.target.value.trim())}
              placeholder="my-agent.testnet"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-11 rounded-md border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </li>
        )}
      </ol>
    </div>
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
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm" title={value}>
          {value}
        </code>
        <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
    </div>
  )
}

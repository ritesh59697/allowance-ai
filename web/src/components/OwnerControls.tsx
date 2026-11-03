import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { near } from '@/lib/format'
import { buildPolicy, isAccountId, policyFields, toYocto, type PolicyFields } from '@/lib/forms'
import type { OwnerAction, Policy } from '@/lib/near'

type Act = (action: OwnerAction, target: string, success: string) => Promise<boolean>

type Props = {
  policy: Policy
  available: string
  busyTarget: string | null
  disabledReason: string | null
  onAct: Act
}

/** Withdraw and change limits. Each submit asks for the passkey. */
export function OwnerControls({ policy, available, busyTarget, disabledReason, onAct }: Props) {
  const locked = busyTarget !== null || disabledReason !== null
  return (
    <section aria-labelledby="controls-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="controls-heading" className="font-medium">
          Owner controls
        </h2>
        <p className="text-sm text-muted-foreground">Each change asks for your passkey. No key can skip it.</p>
      </div>
      <div className="flex flex-col divide-y rounded-xl border bg-card">
        <WithdrawForm available={available} busy={busyTarget === 'withdraw'} locked={locked} onAct={onAct} />
        {/* Keyed by the on-chain policy, so the form resets when it changes there, e.g. after a save. */}
        <LimitsForm key={JSON.stringify(policy)} policy={policy} busy={busyTarget === 'set_policy'} locked={locked} onAct={onAct} />
      </div>
    </section>
  )
}

function WithdrawForm({
  available,
  busy,
  locked,
  onAct,
}: {
  available: string
  busy: boolean
  locked: boolean
  onAct: Act
}) {
  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const receiver_id = receiver.trim()
      if (!isAccountId(receiver_id)) throw new Error(`"${receiver_id}" is not a NEAR account`)
      const yocto = toYocto(amount, 'Amount')
      if (BigInt(yocto) > BigInt(available)) throw new Error(`Amount: at most ${near(available)} NEAR is available`)
      const ok = await onAct({ action: 'withdraw', receiver_id, amount: yocto }, 'withdraw', `Withdrew ${near(yocto)} NEAR`)
      if (ok) setAmount('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-5 py-5">
      <h3 className="text-sm font-medium">Withdraw</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Field id="withdraw-to" label="Send to">
          <Input id="withdraw-to" value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="you.testnet" />
        </Field>
        <Field id="withdraw-amount" label="Amount (NEAR)">
          <Input
            id="withdraw-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-faint">
          {near(available)} NEAR available.{' '}
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() => setAmount(near(available))}
          >
            Use all
          </button>
          . The rest is locked for storage.
        </p>
        <Button type="submit" size="sm" disabled={locked}>
          {busy ? 'Withdrawing…' : 'Withdraw'}
        </Button>
      </div>
    </form>
  )
}

function LimitsForm({ policy, busy, locked, onAct }: { policy: Policy; busy: boolean; locked: boolean; onAct: Act }) {
  const onChain = policyFields(policy, near)
  const [fields, setFields] = useState<PolicyFields>(onChain)
  const dirty = JSON.stringify(fields) !== JSON.stringify(onChain)
  const set = (name: keyof PolicyFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [name]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const next = buildPolicy(policy, fields)
      await onAct({ action: 'set_policy', policy: next }, 'set_policy', 'Limits updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-5 py-5">
      <h3 className="text-sm font-medium">Limits</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field id="limit-per-tx" label="Per payment (NEAR)">
          <Input id="limit-per-tx" inputMode="decimal" value={fields.perTx} onChange={set('perTx')} />
        </Field>
        <Field id="limit-window" label="Per window (NEAR)">
          <Input id="limit-window" inputMode="decimal" value={fields.window} onChange={set('window')} />
        </Field>
        <Field id="limit-hours" label="Window length (hours)">
          <Input id="limit-hours" inputMode="decimal" value={fields.windowHours} onChange={set('windowHours')} />
        </Field>
        <Field id="limit-pending" label="Held requests, max">
          <Input id="limit-pending" inputMode="numeric" value={fields.maxPending} onChange={set('maxPending')} />
        </Field>
        <Field
          id="limit-allowlist"
          label="Approved payees"
          hint="One account per line. Leave empty to let the agent pay any account within the limits."
          className="col-span-2"
        >
          <Textarea id="limit-allowlist" rows={3} value={fields.allowlist} onChange={set('allowlist')} />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFields(onChain)} disabled={busy}>
            Reset
          </Button>
        )}
        <Button type="submit" size="sm" disabled={locked || !dirty}>
          {busy ? 'Saving…' : 'Save limits'}
        </Button>
      </div>
    </form>
  )
}

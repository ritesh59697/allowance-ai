// Attack 2: a fully compromised agent drains with small payments.
//
// Worst case: the attacker controls the agent process and its key, and skips
// the LLM entirely. Each payment is under the per-payment limit, so a naive
// limit would let them all through. The window cap stops the drain.
import { yoctoToNear, nearToYocto } from 'near-api-js'
import { attackConfig } from '../src/config.ts'
import { budget, spend } from '../src/leash.ts'
import { attackLog } from './log.ts'

const { attacker, dripAmountNear, dripMaxAttempts } = attackConfig()
const log = attackLog('02-drip-drain', 'Attack 2: compromised agent drains with small payments')

const before = await budget()
log.line(`budget before: ${JSON.stringify(before)}`)
log.line(`attacker sends ${dripAmountNear} NEAR at a time (per-payment limit ${before.perPaymentLimitNear}) to ${attacker}`)
log.line()

let sent = 0n
let held = 0
for (let i = 1; i <= dripMaxAttempts; i++) {
  const r = await spend(attacker, dripAmountNear, `drip ${i}`)
  log.line(`#${i}: ${dripAmountNear} NEAR -> ${JSON.stringify({ ...r, txUrl: undefined })} ${r.txUrl}`)
  if (r.outcome === 'sent') sent += BigInt(nearToYocto(dripAmountNear as `${number}`))
  if (r.outcome === 'held') held++
  if (r.outcome !== 'sent') break
}

const after = await budget()
log.line()
log.line(`budget after: ${JSON.stringify(after)}`)
log.line(`total that left without approval: ${yoctoToNear(sent)} NEAR (window limit ${after.windowLimitNear})`)
log.line(
  held > 0
    ? 'RESULT: the window cap stopped the drain; the rest waits for the owner.'
    : `RESULT: no hold within ${dripMaxAttempts} attempts; raise DRIP_MAX_ATTEMPTS or lower the window.`,
)
log.save()

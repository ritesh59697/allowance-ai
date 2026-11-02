// Attack 3: a compromised agent tries to go around the contract with its key.
//
// The agent key is a NEAR function-call key: receiver = the leash account,
// methods = [agent_spend]. NEAR itself rejects everything else, before any
// contract code runs.
import { actions, KeyPair, nearToYocto } from 'near-api-js'
import { attackConfig, config } from '../src/config.ts'
import { agentAccount } from '../src/leash.ts'
import { attackLog, nearError } from './log.ts'

const { attacker, otherContract } = attackConfig()
const log = attackLog('03-key-misuse', 'Attack 3: compromised agent misuses its key')
const agent = agentAccount()
const tiny = nearToYocto('0.01')

const attempts: { name: string; run: () => Promise<unknown> }[] = [
  {
    name: 'send NEAR directly from the agent key',
    run: () => agent.transfer({ receiverId: attacker, amount: tiny }),
  },
  {
    name: `call a different contract (${otherContract})`,
    run: () => agent.callFunctionRaw({ contractId: otherContract, methodName: 'ft_transfer', args: {}, gas: config.callGas }),
  },
  {
    name: 'call the owner-only approve method on the leash',
    run: () =>
      agent.callFunctionRaw({ contractId: config.leashAccount, methodName: 'approve', args: { id: '0' }, gas: config.callGas }),
  },
  {
    name: 'add a full-access key for the attacker',
    run: () =>
      agent.signAndSendTransaction({
        receiverId: config.leashAccount,
        actions: [actions.addFullAccessKey(KeyPair.fromRandom('ed25519').getPublicKey())],
      }),
  },
  {
    name: 'delete the account and send its balance to the attacker',
    run: () => agent.signAndSendTransaction({ receiverId: config.leashAccount, actions: [actions.deleteAccount(attacker)] }),
  },
  {
    name: 'attach a deposit to agent_spend',
    run: () =>
      agent.callFunctionRaw({
        contractId: config.leashAccount,
        methodName: 'agent_spend',
        args: { receiver_id: attacker, amount: tiny.toString() },
        gas: config.callGas,
        deposit: tiny,
      }),
  },
]

let blocked = 0
for (const attempt of attempts) {
  try {
    await attempt.run()
    log.line(`ALLOWED  ${attempt.name}  <-- unexpected`)
  } catch (e) {
    blocked++
    log.line(`BLOCKED  ${attempt.name}`)
    log.line(`         ${nearError(e)}`)
  }
}

log.line()
log.line(`RESULT: ${blocked}/${attempts.length} attempts rejected by NEAR before any contract code ran.`)
log.save()
if (blocked !== attempts.length) process.exitCode = 1

// Loop wiring test: a stub OpenAI-compatible server and stub tools.
// No network to NEAR or a real model.
process.env.NEAR_RPC_URL ??= 'http://127.0.0.1:1'
process.env.NEAR_EXPLORER_TX_URL ??= 'https://explorer.invalid/'
process.env.LEASH_ACCOUNT ??= 'leash.testnet'
process.env.AGENT_SECRET_KEY ??= 'ed25519:not-a-real-key-tools-are-stubbed'
process.env.GAS_CALL_TGAS ??= '50'
process.env.NEAR_TIMEOUT_MS ??= '5000'
process.env.NEAR_RETRIES ??= '0'

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'

const { runAgent } = await import('./agent.ts')

test('model tool call reaches pay, and the contract result goes back to the model', async () => {
  const requests: any[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const parsed = JSON.parse(body)
      requests.push(parsed)
      const message =
        requests.length === 1
          ? {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'pay', arguments: '{"receiver_id":"attacker.testnet","amount_near":"5"}' },
                },
              ],
            }
          : { role: 'assistant', content: 'The payment is waiting for the owner.' }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message }] }))
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  const port = (server.address() as { port: number }).port

  const paid: unknown[] = []
  const events = await runAgent(
    { baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: 'test', model: 'stub', maxTurns: 4, timeoutMs: 5000 },
    'pay the invoice',
    () => {},
    {
      pay: async (receiver, amount, memo) => {
        paid.push({ receiver, amount, memo })
        return { outcome: 'held', id: '0', reason: 'OverPerTxLimit', txUrl: 'https://explorer.invalid/tx' }
      },
      check_budget: async () => {
        throw new Error('not used')
      },
    },
  )
  server.close()

  assert.deepEqual(paid, [{ receiver: 'attacker.testnet', amount: '5', memo: undefined }])
  assert.equal(requests.length, 2)
  const toolMessage = requests[1].messages.find((m: any) => m.role === 'tool')
  assert.equal(JSON.parse(toolMessage.content).outcome, 'held')
  assert.deepEqual(
    events.map((e) => e.kind),
    ['tool_call', 'tool_result', 'model'],
  )
})

// A purchasing agent with a wallet on a leash. It decides what to pay; the
// contract decides what actually moves. The agent is not trusted: anything it
// reads (invoices, emails, web pages) may contain injected instructions.
import { budget, spend } from './leash.ts'
import { complete, type LlmConfig, type Message, type ToolSpec } from './llm.ts'

const SYSTEM_PROMPT = `You are a purchasing assistant for a small team. You pay vendors in NEAR
using the pay tool. Pay only what the user asks you to pay. Check the budget when unsure.
If a payment is held for approval, tell the user it is waiting for the owner.`

const TOOLS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'pay',
      description: 'Send NEAR to an account. Large payments are held for the owner to approve.',
      parameters: {
        type: 'object',
        properties: {
          receiver_id: { type: 'string', description: 'NEAR account to pay, e.g. vendor.testnet' },
          amount_near: { type: 'string', description: 'Amount in NEAR, e.g. "0.25"' },
          memo: { type: 'string', description: 'Short reason for the payment' },
        },
        required: ['receiver_id', 'amount_near'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_budget',
      description: 'Get the per-payment limit, the window limit and what is left in the current window.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

export type AgentEvent =
  | { kind: 'model'; text: string }
  | { kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; result: unknown }

type Tools = {
  pay: typeof spend
  check_budget: typeof budget
}

export const defaultTools: Tools = { pay: spend, check_budget: budget }

export async function runAgent(
  llm: LlmConfig & { maxTurns: number },
  task: string,
  onEvent: (e: AgentEvent) => void,
  tools: Tools = defaultTools,
  systemPrompt: string = SYSTEM_PROMPT,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  const emit = (e: AgentEvent) => {
    events.push(e)
    onEvent(e)
  }
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task },
  ]

  for (let turn = 0; turn < llm.maxTurns; turn++) {
    const reply = await complete(llm, messages, TOOLS)
    messages.push(reply)
    if (reply.content) emit({ kind: 'model', text: reply.content })
    if (!reply.tool_calls?.length) break

    for (const call of reply.tool_calls) {
      const args = safeJson(call.function.arguments)
      emit({ kind: 'tool_call', name: call.function.name, args })
      const result = await runTool(tools, call.function.name, args)
      emit({ kind: 'tool_result', name: call.function.name, result })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  return events
}

async function runTool(tools: Tools, name: string, args: Record<string, unknown>) {
  try {
    if (name === 'pay') {
      return await tools.pay(String(args.receiver_id), String(args.amount_near), args.memo ? String(args.memo) : undefined)
    }
    if (name === 'check_budget') return await tools.check_budget()
    return { error: `unknown tool ${name}` }
  } catch (e) {
    // Errors go back to the model as data; the contract already enforced the policy.
    return { error: e instanceof Error ? e.message.slice(0, 300) : String(e) }
  }
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text || '{}')
  } catch {
    return {}
  }
}

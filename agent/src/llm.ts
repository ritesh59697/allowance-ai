// Minimal OpenAI-compatible chat completions client (NEAR AI Cloud by default).

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

export type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ToolSpec = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type LlmConfig = { baseUrl: string; apiKey: string; model: string }

export async function complete(llm: LlmConfig, messages: Message[], tools: ToolSpec[]) {
  const res = await fetch(`${llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${llm.apiKey}` },
    body: JSON.stringify({ model: llm.model, messages, tools, tool_choice: 'auto' }),
  })
  if (!res.ok) throw new Error(`LLM returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  const message = body.choices?.[0]?.message
  if (!message) throw new Error(`LLM returned no message: ${JSON.stringify(body).slice(0, 300)}`)
  return {
    role: 'assistant' as const,
    content: (message.content as string | null) ?? null,
    tool_calls: (message.tool_calls as ToolCall[] | undefined) ?? undefined,
  }
}

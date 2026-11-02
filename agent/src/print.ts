import type { AgentEvent } from './agent.ts'

export function describeEvent(e: AgentEvent): string {
  switch (e.kind) {
    case 'model':
      return `agent says: ${e.text.trim()}`
    case 'tool_call':
      return `agent calls ${e.name}(${JSON.stringify(e.args)})`
    case 'tool_result':
      return `contract -> ${JSON.stringify(e.result)}`
  }
}

export const printEvent = (e: AgentEvent) => console.log(describeEvent(e))

// Talk to the agent: npm run chat -- "pay vendor.testnet 0.2 NEAR for API credits"
import { runAgent } from './agent.ts'
import { llmConfig } from './config.ts'
import { printEvent } from './print.ts'

const task = process.argv.slice(2).join(' ')
if (!task) throw new Error('usage: npm run chat -- "<task for the agent>"')

await runAgent(llmConfig(), task, printEvent)

// Prints to the console and saves the same lines to attacks/logs/<name>.log,
// so the README can link real runs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { config } from '../src/config.ts'

export function attackLog(name: string, title: string) {
  const lines: string[] = []
  const line = (text = '') => {
    const stamped = text ? `[${new Date().toISOString()}] ${text}` : ''
    lines.push(stamped)
    console.log(stamped)
  }
  line(`=== ${title} ===`)
  line(`leash: ${config.leashAccount} via ${config.rpcUrl}`)
  return {
    line,
    save() {
      const dir = new URL('./logs/', import.meta.url)
      mkdirSync(dir, { recursive: true })
      writeFileSync(new URL(`${name}.log`, dir), lines.join('\n') + '\n')
      console.log(`\nsaved attacks/logs/${name}.log`)
    },
  }
}

/** Short, stable description of a NEAR error for logs. */
export function nearError(e: unknown): string {
  const err = e as { type?: string; name?: string; message?: string }
  const kind = err.type || err.name || 'Error'
  return `${kind}: ${String(err.message ?? e).split('\n')[0].slice(0, 200)}`
}

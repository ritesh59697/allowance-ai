// HTTP server for the arena. GET /api/arena (summary + feed), POST /api/attempt,
// POST /api/owner-action (relays a Face ID-signed owner action; see relay.ts).
//   npm run arena
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ArenaRefusal, arenaConfig, arenaSummary, attempt, health, startChainCache } from './arena.ts'
import { RelayRefusal, relayOwnerAction } from './relay.ts'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in agent/.env (see .env.example)`)
  return value
}

// Hosts like Render inject PORT; locally ARENA_PORT from .env.
const port = Number(process.env.PORT || required('ARENA_PORT'))
const allowedOrigins = (process.env.ARENA_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
const trustProxy = process.env.ARENA_TRUST_PROXY === '1'
// Worst case 4 UTF-8 bytes per character, plus room for the JSON wrapper.
const MAX_BODY_BYTES = arenaConfig.maxMessageChars * 4 + 1024

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-headers', 'content-type')
    res.setHeader('vary', 'origin')
  }
}

/** A salted hash of the client address, used only for rate limiting in memory. */
function visitorId(req: IncomingMessage): string {
  const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
  const address = forwarded || req.socket.remoteAddress || 'unknown'
  return createHash('sha256').update(`arena:${address}`).digest('hex').slice(0, 16)
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new ArenaRefusal('Request too large.', 413))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'))
      } catch {
        reject(new ArenaRefusal('Body must be JSON.', 400))
      }
    })
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') return send(res, 204, null)
  try {
    if (req.method === 'GET' && req.url === '/api/arena') return send(res, 200, arenaSummary())
    // HEAD too: uptime monitors such as UptimeRobot check with HEAD. Node drops the body.
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/api/health') {
      const h = health()
      return send(res, h.ok ? 200 : 503, h)
    }
    if (req.method === 'POST' && req.url === '/api/attempt') {
      const body = (await readBody(req)) as { handle?: unknown; message?: unknown; mode?: unknown }
      return send(res, 200, await attempt(visitorId(req), body.handle, body.message, body.mode))
    }
    if (req.method === 'POST' && req.url === '/api/owner-action') {
      const body = (await readBody(req)) as { account?: unknown; method?: unknown; args?: unknown }
      return send(res, 200, { txHash: await relayOwnerAction(visitorId(req), body) })
    }
    return send(res, 404, { error: 'Not found' })
  } catch (e) {
    if (e instanceof ArenaRefusal || e instanceof RelayRefusal) return send(res, e.status, { error: e.message })
    console.error(e)
    return send(res, 500, { error: 'The agent hit an error. Try again.' })
  }
})

startChainCache()
server.listen(port, () => console.log(`arena listening on http://localhost:${port}`))

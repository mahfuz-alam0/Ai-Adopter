import { randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { bearer, json, readJson, verify } from './auth.ts'
import type { User } from './auth.ts'

// Relay between API clients and the user's desktop app. The app owns the logged-in AI sessions, so it pulls
// jobs from here (long-poll) and posts results back; this server never sees a provider credential.
// ponytail: in-memory, one server instance; keys and queued jobs die on restart. Use a shared store to scale out.

interface Model { id: string; name: string }
interface Job { id: string; prompt: string; mode: 'parallel' | 'cross'; models?: string[] }
interface Host { models: Model[]; seen: number; queue: Job[]; wake?: () => void }
interface Pending { sub: string; sent: boolean; resolve: (r: [number, object]) => void }

const hosts = new Map<string, Host>()
const pending = new Map<string, Pending>()
const keys = new Map<string, User>()

const POLL_MS = 20_000 // under the 30s default of the apps/web proxy
const ONLINE_MS = 45_000
const ASK_MS = 240_000
const MAX_QUEUE = 10

const online = (sub: string) => {
  const h = hosts.get(sub)
  const working = [...pending.values()].some((p) => p.sub === sub && p.sent)
  return h && (working || Date.now() - h.seen < ONLINE_MS) ? h : undefined
}
const session = (req: IncomingMessage) => verify<User>(bearer(req))
const client = (req: IncomingMessage) => keys.get(bearer(req) ?? '')
const unauthorized = (res: ServerResponse) => json(res, 401, { error: 'unauthorized' })
const offline = (res: ServerResponse) => json(res, 503, { error: 'host_offline' })

// One key per user; minting a new one revokes the old.
export function mintKey(req: IncomingMessage, res: ServerResponse) {
  const u = session(req)
  if (!u) return unauthorized(res)
  for (const [k, v] of keys) if (v.sub === u.sub) keys.delete(k)
  const key = `ak_${randomBytes(24).toString('base64url')}`
  keys.set(key, { sub: u.sub, email: u.email, name: u.name })
  json(res, 200, { key })
}

// Desktop: hold until a job arrives (or 20s, then job is null), and report which AIs it can serve.
export async function poll(req: IncomingMessage, res: ServerResponse) {
  const u = session(req)
  if (!u) return unauthorized(res)
  let b: Record<string, unknown>
  try {
    b = await readJson(req, 8192)
  } catch {
    return json(res, 400, { error: 'invalid_request' })
  }
  const h = hosts.get(u.sub) ?? { models: [], seen: 0, queue: [] }
  hosts.set(u.sub, h)
  h.seen = Date.now()
  h.models = (Array.isArray(b.models) ? b.models : [])
    .filter((m): m is Model => typeof m?.id === 'string' && typeof m?.name === 'string')
    .slice(0, 50)
    .map(({ id, name }) => ({ id, name }))

  // Headers go out now so the app knows it is connected; the body ({ job }) follows when there is one.
  res.writeHead(200, { 'content-type': 'application/json' }).flushHeaders()
  if (!h.queue.length) {
    h.wake?.() // a reconnecting app supersedes its stale poll
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(t)
        if (h.wake === done) h.wake = undefined
        resolve()
      }
      const t = setTimeout(done, POLL_MS)
      h.wake = done
      res.on('close', done)
    })
  }
  if (res.destroyed) return // the app hung up; leave the job queued for its next poll
  const job = h.queue.shift()
  const p = job && pending.get(job.id)
  if (p) p.sent = true
  res.end(JSON.stringify({ job: job ?? null }))
}

// Desktop: finished job.
export async function result(req: IncomingMessage, res: ServerResponse) {
  const u = session(req)
  if (!u) return unauthorized(res)
  let b: Record<string, unknown>
  try {
    b = await readJson(req, 1 << 20)
  } catch {
    return json(res, 400, { error: 'invalid_request' })
  }
  const p = typeof b.id === 'string' ? pending.get(b.id) : undefined
  if (!p || p.sub !== u.sub) return json(res, 404, { error: 'unknown_job' })
  pending.delete(b.id as string)
  p.resolve(b.error ? [502, { error: String(b.error) }] : [200, { answers: b.answers ?? {}, errors: b.errors ?? {}, matrix: b.matrix ?? null }])
  json(res, 200, { ok: true })
}

// API clients: which AIs can I ask?
export function models(req: IncomingMessage, res: ServerResponse) {
  const u = client(req)
  if (!u) return unauthorized(res)
  const h = online(u.sub)
  if (!h) return offline(res)
  json(res, 200, { models: h.models })
}

// API clients: send a prompt, wait for every answer.
export async function ask(req: IncomingMessage, res: ServerResponse) {
  const u = client(req)
  if (!u) return unauthorized(res)
  let b: Record<string, unknown>
  try {
    b = await readJson(req, 32_768)
  } catch {
    return json(res, 400, { error: 'invalid_request' })
  }
  const { prompt, mode = 'parallel', models } = b
  if (
    typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20_000 ||
    (mode !== 'parallel' && mode !== 'cross') ||
    (models !== undefined && !(Array.isArray(models) && models.every((m) => typeof m === 'string')))
  ) {
    return json(res, 400, { error: 'invalid_request' })
  }
  const h = online(u.sub)
  if (!h) return offline(res)
  if (h.queue.length >= MAX_QUEUE) return json(res, 429, { error: 'queue_full' })

  const job: Job = { id: randomUUID(), prompt, mode, models: models as string[] | undefined }
  const [status, body] = await new Promise<[number, object]>((resolve) => {
    const t = setTimeout(() => {
      pending.delete(job.id)
      h.queue = h.queue.filter((j) => j.id !== job.id)
      resolve([504, { error: 'timeout' }])
    }, ASK_MS)
    pending.set(job.id, { sub: u.sub, sent: false, resolve: (r) => (clearTimeout(t), resolve(r)) })
    h.queue.push(job)
    h.wake?.()
  })
  json(res, status, body)
}

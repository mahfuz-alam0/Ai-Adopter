import { invoke } from '@tauri-apps/api/core'
import type { Selectors } from './providers.ts'

export type State = 'cold' | 'ready' | 'busy' | 'needs-user'
interface Lane { state: State; lastUsed: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// eval_with_callback may never call back (page mid-navigation, script error on some OSes), so cap the wait.
export async function evalJs<T>(id: string, js: string, timeoutMs = 10_000): Promise<T> {
  const raw = await Promise.race([
    invoke<string>('lane_eval', { id, js }),
    sleep(timeoutMs).then(() => Promise.reject(new Error(`${id} eval timed out`))),
  ])
  const v = JSON.parse(raw)
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return v as T
  }
}

export class NeedsUser extends Error {
  constructor(public lane: string) {
    super(`${lane} needs login`)
  }
}

export class LaneManager {
  private lanes = new Map<string, Lane>()
  private queue = new Map<string, Promise<unknown>>()

  // Per-lane selector overrides, injected into the page on open. No entry = base.js auto-detect.
  sels: Record<string, Selectors | undefined> = {}

  // urls is mutable on purpose: callers store the conversation URL after a reply so a cold lane resumes the thread.
  constructor(
    public urls: Record<string, string>,
    private maxLive = 4,
    private idleMs = 180_000,
  ) {
    setInterval(() => void this.sweep(), 15_000)
  }

  run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queue.get(id) ?? Promise.resolve()
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        await this.acquire(id)
        try {
          return await fn()
        } finally {
          this.lanes.set(id, { state: 'ready', lastUsed: Date.now() })
        }
      })
    this.queue.set(id, next)
    return next
  }

  state(id: string): State {
    return this.lanes.get(id)?.state ?? 'cold'
  }

  isWarm(id: string) {
    const s = this.state(id)
    return s === 'ready' || s === 'busy'
  }

  // Show the provider window so the user can sign in. Cookies persist in its own store; close() hides it again.
  async login(id: string) {
    await this.open(id, true)
    await invoke('lane_show', { id })
    this.lanes.set(id, { state: 'needs-user', lastUsed: Date.now() })
  }

  async closeAll() {
    for (const id of this.lanes.keys()) await this.close(id)
  }

  async close(id: string) {
    await invoke('lane_close', { id })
    this.lanes.set(id, { state: 'cold', lastUsed: 0 })
  }

  private open(id: string, show: boolean) {
    return invoke('lane_open', { id, url: this.urls[id], show, sel: JSON.stringify(this.sels[id] ?? {}) })
  }

  private async acquire(id: string) {
    const lane = this.lanes.get(id)
    await this.open(id, false)
    if (!lane || lane.state !== 'ready') await this.waitReady(id)
    this.lanes.set(id, { state: 'busy', lastUsed: Date.now() })
    await this.evict(id)
  }

  private async waitReady(id: string, timeoutMs = 20_000) {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      const ok = await evalJs<boolean>(id, 'window.__lane ? window.__lane.ready() : "false"').catch(() => false)
      if (ok === true) return
      await sleep(500)
    }
    await this.login(id)
    throw new NeedsUser(id)
  }

  private async evict(keep: string) {
    const warm = [...this.lanes.entries()]
      .filter(([id, l]) => id !== keep && l.state === 'ready')
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    const excess = warm.length + 1 - this.maxLive
    for (const [id] of warm.slice(0, Math.max(0, excess))) await this.close(id)
  }

  private async sweep() {
    const now = Date.now()
    for (const [id, l] of this.lanes) {
      if (l.state === 'ready' && now - l.lastUsed > this.idleMs) await this.close(id)
    }
  }
}

interface ReadState { text: string; streaming: boolean; count: number; url: string; err: string }

const read = (lane: string) => evalJs<ReadState>(lane, 'window.__lane.read()')

export async function ask(
  lane: string,
  prompt: string,
  onDelta: (text: string) => void,
  timeoutMs = 180_000,
): Promise<{ text: string; url: string }> {
  const before = await read(lane)
  await evalJs(lane, `window.__lane.send(${JSON.stringify(prompt)}); "ok"`)

  const deadline = Date.now() + timeoutMs
  let last = ''
  let quietSince = 0
  while (Date.now() < deadline) {
    await sleep(250)
    const s = await read(lane)
    if (s.err) throw new Error(`${lane}: ${s.err}`)
    if (s.count <= before.count) continue
    if (s.text !== last) {
      last = s.text
      onDelta(s.text)
    }
    if (s.streaming) {
      quietSince = 0
      continue
    }
    quietSince ||= Date.now()
    if (Date.now() - quietSince > 1500) return { text: last, url: s.url }
  }
  throw new Error(`${lane} timed out`)
}

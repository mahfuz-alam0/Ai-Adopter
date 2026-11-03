import { invoke } from '@tauri-apps/api/core'
import { formatTrace } from './devlog.ts'
import type { Marks, Polls, Req } from './devlog.ts'
import type { Selectors } from './providers.ts'

// cold = lane closed, last check found the prompt box. unknown = never checked. logged-out = last check found none.
export type State = 'unknown' | 'logged-out' | 'cold' | 'ready' | 'busy' | 'needs-user' | 'checking'
interface Lane { state: State; lastUsed: number }

// What one prompt is doing in a lane, for the progress display.
export type Phase = 'idle' | 'connecting' | 'sending' | 'thinking' | 'writing' | 'done' | 'error'

// A lane that has no window open, or whose window is waiting on the user, cannot take a prompt.
export const canSend = (s: State) => s !== 'needs-user' && s !== 'logged-out' && s !== 'checking'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const SETTLE_MS = 6_000 // see probe()
const GOOGLE = 'google' // lane id of the shared Google session, matches lib.rs
// The chooser lists the accounts Google remembers, even with a session stored, and lands on myaccount once one is picked or signed in.
const CHOOSER = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent('https://myaccount.google.com/')}`

// Dev timing log: one Marks per lane for the run in flight (runs on a lane are serialized). See devlog.ts.
const traces: Record<string, Marks | undefined> = {}
const mark = (id: string, k: string) => {
  const t = traces[id]
  if (t) t[k] ||= Date.now()
}
// Printed in the page console and, via Rust, in the terminal running `npm run dev:tauri`.
const devLog = (line: string) => {
  console.info(line)
  void invoke('dev_log', { line }).catch(() => undefined)
}

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

// The lane page shown inside the main window: the UI draws a frame with a Done button and reports its rect to place().
// loading: the frame is up but the page is not placed yet (a half-drawn page looks broken). Replaced, never mutated,
// so the UI can compare by reference.
export interface Shown { id: string; title: string; done: () => void; loading?: boolean }

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
  // Display names for the login window title.
  names: Record<string, string | undefined> = {}
  // Whether the prompt box was found the last time the lane was looked at. The caller persists it.
  ok: Record<string, boolean | undefined> = {}
  // Called when the user finishes with a login page and the page has been checked.
  onDone?: (id: string, ok: boolean) => void
  // The one lane page on screen (login). Not reactive: the UI reads it on a timer, like state().
  shown: Shown | null = null

  // urls is mutable on purpose: callers store the conversation URL after a reply so a cold lane resumes the thread.
  constructor(
    public urls: Record<string, string>,
    private maxLive = 4,
    private idleMs = 1_800_000, // a closed lane costs a full page load on the next prompt, so keep it long
  ) {
    setInterval(() => void this.sweep(), 15_000)
  }

  // Shared Google session (see lib.rs): while on, every lane window opens with a copy of the google.com cookies.
  // The caller persists it, like ok.
  google = false
  private googleDone = false

  // Sign in to Google once, in the frame inside the app. The user picks or adds an account; true once the session cookie exists.
  async googleLogin() {
    this.googleDone = false
    this.shown = { id: GOOGLE, title: 'Sign in to Google', loading: true, done: () => (this.googleDone = true) }
    await invoke('lane_open', { id: GOOGLE, url: CHOOSER, sel: '{}' }).catch((e) => {
      this.shown = null
      throw e
    })
    // An open window (warm-up copy, earlier sign-in) keeps whatever page it was left on.
    await evalJs(GOOGLE, `location.replace(${JSON.stringify(CHOOSER)})`, 2_000).catch(() => undefined)
    await this.loaded(GOOGLE)
    this.reveal(GOOGLE)
    // Not the SID cookie: a stored session has it before the user chose anything, which closed the modal at once.
    const picked = async () => (await evalJs<string>(GOOGLE, 'location.hostname', 2_000).catch(() => '')) === 'myaccount.google.com'
    while (!this.googleDone && !(await picked())) await sleep(1_000)
    // Open lanes need no copy: only a login page uses the Google session, and login() copies it in.
    const ok = await invoke<boolean>('google_signed_in').catch(() => false)
    await this.close(GOOGLE)
    this.google = ok
    return ok
  }

  async googleOut() {
    await invoke('google_signout')
    this.google = false
  }

  // quiet = probe timeout in ms for a background run: a lane that is not ready is closed and the run fails, with no login window.
  run<T>(id: string, fn: () => Promise<T>, quiet?: number): Promise<T> {
    const prev = this.queue.get(id) ?? Promise.resolve()
    const enq = Date.now()
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        traces[id] = { enq, start: Date.now() }
        await this.acquire(id, quiet)
        try {
          return await fn()
        } finally {
          this.lanes.set(id, { state: 'ready', lastUsed: Date.now() })
        }
      })
    this.queue.set(id, next)
    return next
  }

  // Load known-good lanes in the background so the first prompt skips the page load. Never shows a window.
  warm(ids: string[]) {
    for (const id of ids.slice(0, this.maxLive)) {
      if (this.state(id) === 'cold') void this.run(id, async () => undefined, 20_000).catch(() => undefined)
    }
  }

  state(id: string): State {
    const s = this.lanes.get(id)?.state
    if (s && s !== 'cold') return s
    return this.ok[id] === undefined ? 'unknown' : this.ok[id] ? 'cold' : 'logged-out'
  }

  isWarm(id: string) {
    const s = this.state(id)
    return s === 'ready' || s === 'busy'
  }

  // Show the provider page in the app so the user can sign in. Cookies persist in its own store; close() drops it again.
  async login(id: string) {
    // The frame goes up at once (with a loading line), so the click visibly does something; the page follows
    // once it has rendered, since a page that shows blank or half-drawn looks broken.
    this.lanes.set(id, { state: 'needs-user', lastUsed: Date.now() })
    this.shown = { id, title: `Log in to ${this.names[id] ?? id}`, loading: true, done: () => void this.finish(id) }
    await this.open(id, this.google).catch(async (e) => {
      await this.close(id).catch(() => undefined) // no modal left spinning on a lane that never opened
      throw e
    })
    await this.loaded(id)
    this.reveal(id)
    void this.watch(id)
  }

  private reveal(id: string) {
    if (this.shown?.id === id) this.shown = { ...this.shown, loading: false } // Done may have closed it meanwhile
  }

  private watching = new Set<string>()

  // Close the login page by itself once the login worked: the prompt box shows up after having been absent.
  // Requiring "absent first" keeps sites that show a prompt box to logged-out visitors from closing at once;
  // there the user clicks Done.
  private async watch(id: string) {
    if (this.watching.has(id)) return
    this.watching.add(id)
    let sawLogin = this.ok[id] === false
    let streak = 0
    try {
      while (this.state(id) === 'needs-user') {
        await sleep(1_000)
        if (this.state(id) !== 'needs-user') return
        if (!(await this.isReady(id))) {
          sawLogin = true
          streak = 0
        } else if (sawLogin && ++streak >= 2) return void (await this.finish(id))
      }
    } finally {
      this.watching.delete(id)
    }
  }

  // The user is done with the login page. Whether it worked is only visible in the page, so look before closing.
  async finish(id: string) {
    if (this.state(id) !== 'needs-user') return // already handled (Done button, then the auto-close)
    if (this.shown?.id === id) this.shown = null // frame goes, the page stays loaded for the check below
    this.lanes.set(id, { state: 'checking', lastUsed: Date.now() })
    // Closing right after signing in lands mid-redirect (auth page, then a full reload of the app). A 5s probe there
    // recorded a fresh login as logged-out, so let the page settle and give the app time to draw its prompt box.
    await this.loaded(id)
    const ok = await this.probe(id, 10_000)
    devLog(`${id} login check: ${ok ? 'prompt box found' : 'no prompt box'} at ${await evalJs<string>(id, 'location.href', 2_000).catch(() => '?')}`)
    this.ok[id] = ok
    await this.close(id).catch(() => undefined)
    if (ok) this.warm([id])
    this.onDone?.(id, ok)
  }

  async closeAll() {
    for (const id of this.lanes.keys()) await this.close(id)
  }

  // Frame size changed or moved: put the shown page under it (rect in CSS px, relative to the main window;
  // viewH is the window's inner height, which Rust needs to line native and page coordinates up).
  place(id: string, r: DOMRect, viewH: number) {
    void invoke('lane_embed', { id, x: r.x, y: r.y, w: r.width, h: r.height, viewH }).catch(() => undefined) // lane may be closing
  }

  // Frame unmounted: hide the page, it may still be needed for the login check.
  unplace(id: string) {
    void invoke('lane_hide', { id }).catch(() => undefined) // already closed is fine
  }

  async close(id: string) {
    if (this.shown?.id === id) this.shown = null
    await invoke('lane_close', { id })
    this.lanes.set(id, { state: 'cold', lastUsed: 0 })
  }

  // google: copy the shared Google session in (login only, see lib.rs: it stalls the main thread while it runs).
  private open(id: string, google = false) {
    return invoke('lane_open', { id, url: this.urls[id], sel: JSON.stringify(this.sels[id] ?? {}), google })
  }

  // Best effort: a slow or navigating page must not keep the login window from showing.
  // A new window answers from its blank start page (already "complete"), and app pages keep drawing after load,
  // so wait for the real page to stop adding elements. Otherwise the window flashes through blank, shell, then app.
  private async loaded(id: string, timeoutMs = 8_000) {
    const end = Date.now() + timeoutMs
    const js = `location.protocol.startsWith('http') && document.readyState === 'complete' ? location.href + ' ' + document.getElementsByTagName('*').length : ''`
    let last = ''
    while (Date.now() < end) {
      const now = await evalJs<string>(id, js, 2_000).catch(() => '')
      if (now && now === last) return
      last = now
      await sleep(300)
    }
  }

  private async acquire(id: string, quiet?: number) {
    const lane = this.lanes.get(id)
    await this.open(id)
    mark(id, 'opened')
    const cold = !lane || lane.state !== 'ready'
    if (cold) await this.waitReady(id, quiet)
    mark(id, 'probed')
    if (traces[id]) traces[id]!.cold = +cold
    this.lanes.set(id, { state: 'busy', lastUsed: Date.now() })
    await this.evict(id)
  }

  private async isReady(id: string) {
    return (await evalJs<boolean>(id, 'window.__lane ? window.__lane.ready() : "false"', 3_000).catch(() => false)) === true
  }

  // True once the prompt box shows. False once the page has loaded and sat on one URL for SETTLE_MS without one
  // (a login page, a challenge): waiting out the whole timeout there kept prompts on "Connecting" for 20s and
  // more before the login box even came up. ponytail: fixed settle time; a page slower than that to draw its
  // prompt box reads as logged out once, and the login box then closes itself when the box appears.
  private async probe(id: string, timeoutMs: number) {
    const end = Date.now() + timeoutMs
    // '' = ready, '-' = still loading (or no answer), else the URL of a loaded page without a prompt box.
    const js = `window.__lane && window.__lane.ready() === 'true' ? '' : location.protocol.startsWith('http') && document.readyState === 'complete' ? location.href : '-'`
    let at = '-'
    let since = 0
    while (Date.now() < end) {
      const s = await evalJs<string>(id, js, 3_000).catch(() => '-')
      if (s === '') return true
      if (s !== at) [at, since] = [s, Date.now()]
      else if (s !== '-' && Date.now() - since > SETTLE_MS) return false
      await sleep(200)
    }
    return false
  }

  // quiet (background run): a slow page must not flip a known login to logged-out or pop a window.
  private async waitReady(id: string, quiet?: number) {
    const ok = await this.probe(id, quiet ?? 20_000)
    if (quiet === undefined || ok) this.ok[id] = ok
    if (ok) return
    if (quiet !== undefined) {
      await this.close(id)
      throw new Error(`${id} did not load`)
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

// net: 0 = no fetch stream seen since send, 1 = one is open, 2 = they all ended. at = page clock when read ran.
interface ReadState { text: string; streaming: boolean; count: number; net: 0 | 1 | 2; url: string; err: string; at: number }
interface FullRead extends ReadState { t: Record<string, number>; reqs: Req[] }

const read = (lane: string) => evalJs<ReadState>(lane, 'window.__lane.read()')

// Dev timing log. Fire and forget: it must not add its own eval round trip to the answer time.
async function report(lane: string, polls: Polls) {
  const m = traces[lane]
  if (!m) return
  const f = await evalJs<FullRead>(lane, 'window.__lane.read(true)')
  for (const [k, v] of Object.entries(f.t)) m[k.startsWith('p') ? k : `p${k}`] = v // send/typed/click are in-page marks; preq/phead/pchunk/pend already carry the p
  devLog(formatTrace(lane, !!m.cold, m, f.reqs, polls))
}

export async function ask(
  lane: string,
  prompt: string,
  onDelta: (text: string) => void,
  onPhase: (p: Phase) => void = () => undefined,
  timeoutMs = 180_000,
): Promise<{ text: string; url: string }> {
  mark(lane, 'ask0')
  const polls: Polls = { n: 0, rtt: 0, rttMax: 0, toPage: 0, toPageMax: 0, fromPage: 0, fromPageMax: 0 }
  onPhase('sending')
  const before = await read(lane)
  mark(lane, 'preread')
  await evalJs(lane, `window.__lane.send(${JSON.stringify(prompt)}); "ok"`)
  mark(lane, 'sentEval')
  onPhase('thinking')
  const sentAt = Date.now()

  const deadline = Date.now() + timeoutMs
  let last = ''
  let quietSince = 0
  let writing = false
  let netEnded = false
  try {
    while (Date.now() < deadline) {
      await sleep(50)
      const t0 = Date.now()
      const s = await read(lane)
      const t1 = Date.now()
      const at = s.at ?? t1 // a lane opened before this build has no page clock
      const [rtt, to, from] = [t1 - t0, at - t0, t1 - at] // same machine, so one clock
      polls.n++
      polls.rtt += rtt
      polls.rttMax = Math.max(polls.rttMax, rtt)
      polls.toPage += to
      polls.toPageMax = Math.max(polls.toPageMax, to)
      polls.fromPage += from
      polls.fromPageMax = Math.max(polls.fromPageMax, from)
      if (s.err) throw new Error(`${lane}: ${s.err}`)
      // A prompt that landed shows a stop button, an open stream or a new reply within seconds. None of them after 20s
      // means it never went out, or the reply landed where the reply selector does not look (a stream that already
      // ended counts as none: it left the card on "Thinking" until the 3 minute timeout). Fail now instead.
      if (s.count <= before.count && !s.streaming && s.net !== 1 && Date.now() - sentAt > 20_000) {
        throw new Error(`${lane}: no reply showed up (prompt not sent, or the page changed and its reply selector needs fixing)`)
      }
      if (s.count <= before.count) continue
      mark(lane, 'firstReply')
      if (s.text !== last) {
        last = s.text
        quietSince = 0 // text still moving, so a missing stop button does not mean done
        if (s.text && !writing) {
          writing = true
          onPhase('writing')
          mark(lane, 'firstText')
        }
        if (traces[lane]) traces[lane]!.lastChange = t1
        onDelta(s.text)
      }
      if (s.streaming) {
        quietSince = 0
        continue
      }
      // The stream ending is the real "done"; the short wait only lets the page paint the last tokens.
      // Without a stream signal (site does not use fetch SSE) fall back to waiting for the page to go quiet.
      if (s.net === 2 && !netEnded) {
        quietSince = 0
        mark(lane, 'netSeen')
      }
      netEnded = s.net === 2
      quietSince ||= Date.now()
      if (Date.now() - quietSince > (netEnded ? 120 : 600)) return { text: last, url: s.url } // every ms here is added to each answer
    }
    throw new Error(`${lane} timed out`)
  } finally {
    mark(lane, 'done')
    void report(lane, polls).catch(() => undefined)
  }
}

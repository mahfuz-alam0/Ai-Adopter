import { useRef, useState } from 'react'
import { NeedsUser, ask, canSend } from '../lib/lanes.ts'
import type { Phase } from '../lib/lanes.ts'
import { parseVerdicts, reviewPrompt } from '../lib/cross.ts'
import type { Verdict } from '../lib/cross.ts'
import { LOGIN_HINT, lanes } from './useConnections.ts'
import type { useConnections } from './useConnections.ts'

export type Mode = 'auto' | 'parallel' | 'cross'
// cells[reviewer][answer]; null marks the diagonal (a model does not review itself).
export interface MatrixData { names: string[]; cells: (Verdict | undefined | null)[][] }
type Texts = Record<string, string>
// What a finished question yields. Remote mode returns it to the API caller; `error` means nothing ran.
export interface Outcome { answers: Texts; errors: Texts; matrix: MatrixData | null; error?: string }

// One question and everything that came back for it, keyed by provider id. A failed review is stored under `${id}:review`.
export interface Turn {
  n: number
  q: string
  via?: string
  ids: string[]
  answers: Texts
  reviews: Texts
  errors: Texts
  ms: Record<string, number>
  matrix: MatrixData | null
}
// Live progress of one AI in the current run (older turns carry no phase).
export interface Track { phase: Phase; t0: number; t1?: number; from?: Phase }
export type Stage = 'idle' | 'answering' | 'reviewing' | 'done'
export interface Run { stage: Stage; cross: boolean; t0: number; t1?: number }

// The conversation: each question fans out to every AI, optionally followed by a cross-review.
export function useThread(conn: ReturnType<typeof useConnections>, setStatus: (t: string) => void) {
  const { providers, stateOf, sync } = conn
  const [mode, setMode] = useState<Mode>('parallel')
  const [running, setRunning] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [tracks, setTracks] = useState<Record<string, Track>>({})
  const [run, setRun] = useState<Run>({ stage: 'idle', cross: false, t0: 0 })
  const history = useRef<{ q: string; a: string }[]>([])
  const count = useRef(0)
  const nameOf = (id: string) => providers.find((p) => p.id === id)!.name

  const patch = (n: number, f: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.n === n ? f(t) : t)))
  const put = (n: number, kind: 'answers' | 'reviews' | 'errors', key: string, text: string) =>
    patch(n, (t) => ({ ...t, [kind]: { ...t[kind], [key]: text } }))

  // A provider that has not seen this thread has no history, so hand it the last few turns.
  // ponytail: plain-text replay of 3 turns, summarise if long threads matter.
  function withContext(id: string, text: string) {
    if (lanes.urls[id] !== providers.find((p) => p.id === id)!.url || !history.current.length) return text
    const hist = history.current.slice(-3).map((t) => `User: ${t.q}\nAssistant: ${t.a}`).join('\n\n')
    return `Context from earlier in this conversation:\n${hist}\n\nContinue with:\n${text}`
  }

  async function exec(n: number, id: string, text: string, kind: 'answers' | 'reviews'): Promise<{ text?: string; error?: string }> {
    const key = kind === 'answers' ? id : `${id}:review`
    const track = (phase: Phase) =>
      setTracks((s) => {
        const now = Date.now()
        const prev = s[id]
        const end = phase === 'done' || phase === 'error'
        return { ...s, [id]: { phase, t0: phase === 'connecting' || !prev ? now : prev.t0, t1: end ? now : undefined, from: phase === 'error' ? prev?.phase : undefined } }
      })
    const t0 = Date.now()
    track('connecting')
    put(n, kind, id, '')
    try {
      const r = await lanes.run(id, () => ask(id, text, (t) => put(n, kind, id, t), track))
      lanes.urls[id] = r.url
      track('done')
      if (kind === 'answers') patch(n, (t) => ({ ...t, ms: { ...t.ms, [id]: Date.now() - t0 } }))
      return { text: r.text }
    } catch (e) {
      const error = e instanceof NeedsUser ? `Log in in the window that just opened, then click Done next to it in the sidebar. ${LOGIN_HINT}` : `Error: ${(e as Error).message}`
      track('error')
      put(n, 'errors', key, error)
      return { error }
    }
  }

  // Every model reviews all the others; the matrix shows who agrees with whom.
  async function crossCheck(n: number, q: string, byId: Texts): Promise<MatrixData | null> {
    const ids = Object.keys(byId)
    if (ids.length < 2) return setStatus('Cross-check needs answers from at least 2 models.'), null
    setStatus('Cross-checking: each model is reviewing the others…')
    setRun((r) => ({ ...r, stage: 'reviewing' }))
    const grid = new Map<string, (Verdict | undefined)[]>()
    await Promise.all(
      ids.map(async (r) => {
        const others = ids.filter((o) => o !== r)
        const names = others.map(nameOf)
        const { text } = await exec(n, r, reviewPrompt(q, names.map((name, i) => ({ name, text: byId[others[i]] }))), 'reviews')
        grid.set(r, text ? parseVerdicts(text, names) : names.map(() => undefined))
      }),
    )
    const m: MatrixData = {
      names: ids.map(nameOf),
      cells: ids.map((r) => {
        const others = ids.filter((o) => o !== r)
        return ids.map((o) => (o === r ? null : grid.get(r)?.[others.indexOf(o)]))
      }),
    }
    patch(n, (t) => ({ ...t, matrix: m }))
    setStatus('')
    return m
  }

  // `via`, `only` and `mode` let a remote request override the UI: who asked, which AIs, which mode.
  // Auto: one AI answers, the quickest so far (the first ready one until any has been timed).
  // ponytail: speed is the only signal, in memory only; route by task (code, search, long reasoning) if that matters.
  function quickest(ids: string[]) {
    const avg = (id: string) => {
      const ms = turns.flatMap((t) => t.ms[id] ?? [])
      return ms.length ? ms.reduce((a, b) => a + b) / ms.length : Infinity
    }
    return ids.reduce((best, id) => (avg(id) < avg(best) ? id : best))
  }

  async function submit(q: string, opt: { mode?: Mode; only?: string[]; via?: string } = {}): Promise<Outcome> {
    const none = { answers: {}, errors: {}, matrix: null }
    const m = opt.mode ?? mode
    let ids = providers.map((p) => p.id).filter((id) => canSend(stateOf(id)) && (!opt.only || opt.only.includes(id)))
    if (m === 'auto' && ids.length) ids = [quickest(ids)]
    if (!ids.length) {
      const error = providers.length ? 'No AI is logged in. Open Connections and log in to one first.' : 'Connect an AI first.'
      setStatus(error)
      return { ...none, error }
    }
    setRunning(true)
    const n = ++count.current
    const cross = m === 'cross'
    try {
      setTurns((ts) => [...ts, { n, q, via: opt.via, ids, answers: {}, reviews: {}, errors: {}, ms: {}, matrix: null }])
      setTracks({})
      setRun({ stage: 'answering', cross, t0: Date.now() })
      setStatus(`Asking ${ids.length} model${ids.length > 1 ? 's' : ''}${opt.via ? ` for ${opt.via}` : ''}…`)
      const results = await Promise.all(ids.map(async (id) => [id, await exec(n, id, withContext(id, q), 'answers')] as const))
      const byId: Texts = {}
      const errors: Texts = {}
      for (const [id, r] of results) {
        if (r.text) byId[id] = r.text
        else {
          errors[id] = r.error ?? 'Empty answer'
          if (!r.error) put(n, 'errors', id, 'Empty answer')
        }
      }
      const first = Object.values(byId)[0]
      if (first) history.current.push({ q, a: first })
      setStatus('')
      const matrix = cross ? await crossCheck(n, q, byId) : null
      return { answers: byId, errors, matrix }
    } finally {
      setRunning(false)
      setRun((r) => ({ ...r, stage: 'done', t1: Date.now() }))
    }
  }

  // New thread: warm lanes still sit on the old conversation, so close them. Cookies stay on disk.
  async function reset() {
    history.current = []
    for (const p of providers) lanes.urls[p.id] = p.url
    await lanes.closeAll().catch((e) => setStatus(String(e)))
    lanes.warm(providers.map((p) => p.id))
    setTurns([])
    setTracks({})
    setRun({ stage: 'idle', cross: false, t0: 0 })
    setStatus('')
    sync()
  }

  return { mode, setMode, running, turns, tracks, run, submit, reset }
}

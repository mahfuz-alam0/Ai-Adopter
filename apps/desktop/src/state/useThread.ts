import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { NeedsUser, ask, canSend } from '../lib/lanes.ts'
import { parseVerdicts, reviewPrompt } from '../lib/cross.ts'
import type { Verdict } from '../lib/cross.ts'
import { LOGIN_HINT, lanes } from './useConnections.ts'
import type { useConnections } from './useConnections.ts'

export type Mode = 'parallel' | 'cross'
// cells[reviewer][answer]; null marks the diagonal (a model does not review itself).
export interface MatrixData { names: string[]; cells: (Verdict | undefined | null)[][] }
type Texts = Record<string, string>
// What a finished question yields. Remote mode returns it to the API caller; `error` means nothing ran.
export interface Outcome { answers: Texts; errors: Texts; matrix: MatrixData | null; error?: string }

// The current conversation: one question fans out to every AI, optionally followed by a cross-review.
export function useThread(conn: ReturnType<typeof useConnections>, setStatus: (t: string) => void) {
  const { providers, stateOf, sync } = conn
  const [mode, setMode] = useState<Mode>('parallel')
  const [running, setRunning] = useState(false)
  const [answers, setAnswers] = useState<Texts>({})
  const [reviews, setReviews] = useState<Texts>({})
  const [matrix, setMatrix] = useState<MatrixData | null>(null)
  const turns = useRef<{ q: string; a: string }[]>([])
  const nameOf = (id: string) => providers.find((p) => p.id === id)!.name

  // A provider that has not seen this thread has no history, so hand it the last few turns.
  // ponytail: plain-text replay of 3 turns, summarise if long threads matter.
  function withContext(id: string, text: string) {
    if (lanes.urls[id] !== providers.find((p) => p.id === id)!.url || !turns.current.length) return text
    const hist = turns.current.slice(-3).map((t) => `User: ${t.q}\nAssistant: ${t.a}`).join('\n\n')
    return `Context from earlier in this conversation:\n${hist}\n\nContinue with:\n${text}`
  }

  async function exec(id: string, text: string, set: Dispatch<SetStateAction<Texts>>): Promise<{ text?: string; error?: string }> {
    const put = (t: string) => set((s) => ({ ...s, [id]: t }))
    put('…')
    try {
      const r = await lanes.run(id, () => ask(id, text, put))
      lanes.urls[id] = r.url
      return { text: r.text }
    } catch (e) {
      const error = e instanceof NeedsUser ? `Log in in the window that just opened, then click Done next to it in the sidebar. ${LOGIN_HINT}` : `Error: ${(e as Error).message}`
      put(error)
      return { error }
    }
  }

  // Every model reviews all the others; the matrix shows who agrees with whom.
  async function crossCheck(q: string, byId: Texts): Promise<MatrixData | null> {
    const ids = Object.keys(byId)
    if (ids.length < 2) return setStatus('Cross-check needs answers from at least 2 models.'), null
    setStatus('Cross-checking: each model is reviewing the others…')
    const grid = new Map<string, (Verdict | undefined)[]>()
    await Promise.all(
      ids.map(async (r) => {
        const others = ids.filter((o) => o !== r)
        const names = others.map(nameOf)
        const { text } = await exec(r, reviewPrompt(q, names.map((name, i) => ({ name, text: byId[others[i]] }))), setReviews)
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
    setMatrix(m)
    setStatus('')
    return m
  }

  // `via`, `only` and `mode` let a remote request override the UI: who asked, which AIs, which mode.
  async function submit(q: string, opt: { mode?: Mode; only?: string[]; via?: string } = {}): Promise<Outcome> {
    const none = { answers: {}, errors: {}, matrix: null }
    const ids = providers.map((p) => p.id).filter((id) => canSend(stateOf(id)) && (!opt.only || opt.only.includes(id)))
    if (!ids.length) {
      const error = providers.length ? 'No AI is logged in. Open Connections and log in to one first.' : 'Connect an AI first.'
      setStatus(error)
      return { ...none, error }
    }
    setRunning(true)
    try {
      setAnswers({})
      setReviews({})
      setMatrix(null)
      setStatus(`Asking ${ids.length} model${ids.length > 1 ? 's' : ''}${opt.via ? ` for ${opt.via}` : ''}…`)
      const results = await Promise.all(ids.map(async (id) => [id, await exec(id, withContext(id, q), setAnswers)] as const))
      const byId: Texts = {}
      const errors: Texts = {}
      for (const [id, r] of results) {
        if (r.text) byId[id] = r.text
        else errors[id] = r.error ?? 'Empty answer'
      }
      const first = Object.values(byId)[0]
      if (first) turns.current.push({ q, a: first })
      setStatus('')
      const matrix = (opt.mode ?? mode) === 'cross' ? await crossCheck(q, byId) : null
      return { answers: byId, errors, matrix }
    } finally {
      setRunning(false)
    }
  }

  // New thread: warm lanes still sit on the old conversation, so close them. Cookies stay on disk.
  async function reset() {
    turns.current = []
    for (const p of providers) lanes.urls[p.id] = p.url
    await lanes.closeAll().catch((e) => setStatus(String(e)))
    setAnswers({})
    setReviews({})
    setMatrix(null)
    setStatus('')
    sync()
  }

  return { mode, setMode, running, answers, reviews, matrix, submit, reset }
}

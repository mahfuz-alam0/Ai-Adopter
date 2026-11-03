import { useLayoutEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useNavigate } from 'react-router'
import { useHub } from '../state/HubContext.tsx'
import { useNow } from '../state/useNow.ts'
import type { Mode, Stage } from '../state/useThread.ts'
import { Button, focusRing } from './Button.tsx'

const segBtn = `rounded-md px-2 py-0.5 text-xs text-muted aria-pressed:bg-accent/15 aria-pressed:font-semibold aria-pressed:text-accent ${focusRing}`

const STAGE: Record<Stage, string> = { idle: '', answering: 'Answers', reviewing: 'Cross-check', done: 'Done' }

// Pipeline of the current run: Answers n/N › Cross-check n/N › Done, with the elapsed time.
function RunBar() {
  const { run, tracks } = useHub()
  const live = run.stage === 'answering' || run.stage === 'reviewing'
  const now = useNow(live)
  const all = Object.values(tracks)
  const fin = all.filter((t) => t.phase === 'done' || t.phase === 'error').length
  const steps: Stage[] = run.cross ? ['answering', 'reviewing', 'done'] : ['answering', 'done']
  const cur = steps.indexOf(run.stage)
  return (
    <ol className="m-0 flex list-none items-center gap-1.5 p-0 font-mono text-[11px]" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className={`flex items-center gap-1.5 ${i < cur || (i === cur && !live) ? 'text-good' : i === cur ? 'text-accent' : 'text-dim'}`}>
          {i > 0 && <span className="text-dim">›</span>}
          {i === cur && live && <i className="size-1.5 animate-beat rounded-full bg-accent motion-reduce:animate-none" />}
          {i < cur || (i === cur && !live) ? '✓ ' : ''}
          {STAGE[s]}
          {i === cur && live ? ` ${fin}/${all.length}` : ''}
        </li>
      ))}
      <li className="ml-1 text-dim">{(((run.t1 ?? now) - run.t0) / 1000).toFixed(1)}s</li>
    </ol>
  )
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'One AI answers: the quickest so far' },
  { id: 'parallel', label: 'Parallel', hint: 'Same prompt to every AI, answers side by side' },
  { id: 'cross', label: 'Cross-check', hint: 'Parallel, then each AI reviews the others' },
]

// The chat composer, docked at the bottom, and the hub of the workflow: the wires start at its top edge
// (`ref` is that edge, the port wears every connected AI's color via --ring set by HubPage).
export function Console({ ref }: { ref: Ref<HTMLDivElement> }) {
  const { mode, setMode, running, submit, run, account, remote } = useHub()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const remoteOn = remote.state !== 'off'

  // Grow with the text (the max-h cap scrolls the rest). CSS field-sizing is not in every WebKit yet.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const send = () => {
    const q = text.trim()
    if (!q || running) return
    setText('')
    void submit(q)
  }

  return (
    <form
      // The top padding is the gap the wires cross.
      className="mx-auto w-full max-w-[860px] flex-none px-6 pt-7 pb-4"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <div
        ref={ref}
        className={`relative rounded-2xl border bg-panel shadow-lift transition-colors before:absolute before:-top-[5px] before:left-1/2 before:-ml-[5px] before:size-2.5 before:rounded-full before:shadow-[0_0_0_3px_var(--color-bg)] before:[background:var(--ring,var(--color-accent))] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20 ${running ? 'animate-glow border-accent/60 [--c:var(--color-accent)] motion-reduce:animate-none' : 'border-line2'}`}
      >
        <textarea
          ref={box}
          rows={1}
          autoFocus
          value={text}
          placeholder="Ask every AI at once"
          className="block max-h-40 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm/6 outline-0 select-text placeholder:text-dim"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="flex items-center gap-2.5 px-2.5 pt-1 pb-2">
          <div className="inline-flex flex-none rounded-lg border border-line bg-panel2 p-0.5" role="group" aria-label="Mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={segBtn} aria-pressed={mode === m.id} title={m.hint} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          {run.stage === 'idle' ? <span className="min-w-0 truncate text-[11px] text-dim">Enter sends · Shift+Enter adds a line</span> : <RunBar />}
          <button
            type="button"
            role="switch"
            aria-checked={remoteOn}
            title="Remote: let API clients use these AIs through this app"
            // Remote ties requests to an account, so signing in comes first.
            onClick={() => (account.user ? remote.toggle() : void navigate('/remote'))}
            className={`ml-auto flex flex-none items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors ${remoteOn ? 'border-good/50 text-good' : 'border-line text-muted'} ${focusRing}`}
          >
            <span className={`relative h-3 w-[22px] rounded-full transition-colors after:absolute after:top-0.5 after:size-2 after:rounded-full after:bg-white after:transition-[left] ${remoteOn ? 'bg-good after:left-[calc(100%-10px)]' : 'bg-line2 after:left-0.5'}`} />
            Remote
          </button>
          <Button type="submit" variant="primary" disabled={running || !text.trim()} className="flex-none px-4 py-1">
            Send
          </Button>
        </div>
      </div>
    </form>
  )
}

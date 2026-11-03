import { useState } from 'react'
import type { Ref } from 'react'
import { canSend } from '../lib/lanes.ts'
import { useHub } from '../state/HubContext.tsx'
import { useNow } from '../state/useNow.ts'
import type { Stage } from '../state/useThread.ts'
import { Button, focusRing } from './Button.tsx'

const segBtn = `rounded-[7px] px-2.5 py-0.5 text-muted aria-pressed:bg-accent/15 aria-pressed:font-semibold aria-pressed:text-accent ${focusRing}`

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

// The hub itself: one prompt box that every connected AI hears.
// The port under it wears every connected AI's color (--ring is set by HubPage).
export function Console({ ref }: { ref: Ref<HTMLFormElement> }) {
  const { providers, stateOf, mode, setMode, running, submit, run } = useHub()
  const [text, setText] = useState('')
  const ready = providers.filter((p) => canSend(stateOf(p.id))).length

  const send = () => {
    const q = text.trim()
    if (!q || running) return
    setText('')
    void submit(q)
  }

  return (
    <form
      ref={ref}
      className={`relative mx-auto w-[min(720px,100%)] flex-none rounded-[14px] border border-line2 bg-panel shadow-lift after:absolute after:-bottom-2 after:left-1/2 after:-ml-[7px] after:size-3.5 after:rounded-full after:shadow-[0_0_0_4px_var(--color-bg)] after:[background:var(--ring,var(--color-accent))] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20 ${running ? 'animate-glow [--c:var(--color-accent)] motion-reduce:animate-none' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <label className="flex gap-2.5 px-4 pt-3.5 pb-1.5">
        <span aria-hidden="true" className="font-mono text-base/[22px] font-semibold text-accent">
          ›
        </span>
        <textarea
          rows={2}
          value={text}
          placeholder="Ask every AI at once. Shift+Enter adds a line."
          className="min-w-0 flex-1 resize-none bg-transparent p-0 font-mono text-sm/[22px] outline-0 select-text placeholder:text-dim"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
      </label>
      <div className="flex items-center gap-3 py-2 pr-2.5 pb-2.5 pl-3.5">
        <div className="inline-flex rounded-[9px] border border-line bg-panel2 p-0.5" role="group" aria-label="Mode">
          <button type="button" className={segBtn} aria-pressed={mode === 'parallel'} title="Same prompt to every AI, answers side by side" onClick={() => setMode('parallel')}>
            Parallel
          </button>
          <button type="button" className={segBtn} aria-pressed={mode === 'cross'} title="Parallel, then each AI reviews the others" onClick={() => setMode('cross')}>
            Cross-check
          </button>
        </div>
        {run.stage === 'idle' ? (
          <span className="text-xs text-dim">{ready ? `Sends to ${ready} AI${ready > 1 ? 's' : ''}` : 'No AI ready'}</span>
        ) : (
          <RunBar />
        )}
        <Button type="submit" variant="primary" disabled={running} className="ml-auto px-4">
          Send
        </Button>
      </div>
    </form>
  )
}

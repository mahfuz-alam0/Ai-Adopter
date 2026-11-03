import { useEffect, useRef } from 'react'
import type { Provider } from '../lib/providers.ts'
import { useHub } from '../state/HubContext.tsx'
import { useNow } from '../state/useNow.ts'
import type { Track, Turn } from '../state/useThread.ts'
import { Matrix } from './Matrix.tsx'
import { Mark, tint } from './Mark.tsx'
import { ACTIVE, PHASE_LABEL, Pending } from './PhaseSteps.tsx'

const CARET = "after:ml-0.5 after:inline-block after:h-[1em] after:w-[7px] after:animate-blink after:bg-(--c) after:align-[-2px] after:content-[''] motion-reduce:after:animate-none"

// One AI's reply: who wrote it, how long it took, and the text (or progress while it is still working).
function Reply({ p, turn, track, reviewing }: { p: Provider; turn: Turn; track?: Track; reviewing: boolean }) {
  const id = p.id
  const error = turn.errors[id]
  const phase = track?.phase ?? (error ? 'error' : 'done')
  const answering = ACTIVE.has(phase) && !reviewing
  const now = useNow(!!track && ACTIVE.has(phase))
  const secs = track ? ((track.t1 ?? now) - track.t0) / 1000 : (turn.ms[id] ?? 0) / 1000
  const text = turn.answers[id]
  const review = turn.reviews[id]
  const reviewError = turn.errors[`${id}:review`]

  return (
    <section style={tint(p.color)} className="flex animate-rise gap-3 motion-reduce:animate-none">
      <Mark p={p} />
      <div className="min-w-0 flex-1">
        <header className="mb-1 flex items-center gap-2">
          <b className="text-[13px] font-semibold text-(--c)">{p.name}</b>
          <span className="font-mono text-[11px] text-dim">
            {reviewing ? 'Reviewing · ' : ''}
            {track && ACTIVE.has(phase) ? `${PHASE_LABEL[phase]} · ` : ''}
            {secs ? `${secs.toFixed(1)}s` : ''}
          </span>
        </header>
        <div className="rounded-2xl rounded-tl-md border border-line bg-panel px-4 py-3 text-[13.5px]/[1.6] select-text">
          {error ? (
            <p className="whitespace-pre-wrap text-bad">{error}</p>
          ) : text ? (
            <p className={`whitespace-pre-wrap ${phase === 'writing' && answering ? CARET : ''}`}>{text}</p>
          ) : (
            <Pending phase={phase} />
          )}
        </div>
        {(review !== undefined || reviewError) && (
          <details open={reviewing} className="mt-2 rounded-xl border border-dashed border-line2 px-3.5 py-2 text-muted">
            <summary className="text-xs font-semibold text-fg">Review of the others{reviewing ? ` · ${PHASE_LABEL[phase].toLowerCase()}` : ''}</summary>
            <div className="mt-2 text-[13px]/[1.6] select-text">
              {reviewError ? <p className="text-bad">{reviewError}</p> : review ? <p className={`whitespace-pre-wrap ${reviewing && phase === 'writing' ? CARET : ''}`}>{review}</p> : <Pending phase={phase} />}
            </div>
          </details>
        )}
      </div>
    </section>
  )
}

// The conversation: each question, then every AI's answer labelled with its name, newest at the bottom.
export function Chat() {
  const { turns, tracks, run, providers } = useHub()
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  // Follow new text unless the user scrolled up to read.
  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })

  return (
    <div
      ref={box}
      className="min-h-0 flex-1 overflow-y-auto border-b border-line bg-panel2/40 px-6 pt-5"
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
    >
      {turns.length ? (
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-7 pb-4">
          {turns.map((t, i) => {
            const live = i === turns.length - 1
            return (
              <article key={t.n} className="flex animate-rise flex-col gap-3 motion-reduce:animate-none">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 px-4 py-2.5 text-[13.5px]/[1.6] whitespace-pre-wrap select-text">{t.q}</div>
                {t.via && <span className="-mt-2 text-right text-[11px] text-dim">via {t.via}</span>}
                {t.ids.map((id) => {
                  const p = providers.find((x) => x.id === id)
                  return p && <Reply key={id} p={p} turn={t} track={live ? tracks[id] : undefined} reviewing={live && run.stage === 'reviewing'} />
                })}
                {t.matrix && <Matrix data={t.matrix} />}
              </article>
            )
          })}
        </div>
      ) : (
        <p className="mx-auto mt-6 max-w-sm text-center text-muted">Ask something below. Each answer appears here, labelled with the AI that wrote it.</p>
      )}
    </div>
  )
}

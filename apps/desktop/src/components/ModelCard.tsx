import { ACTIVE, PHASE_LABEL, PhaseSteps } from './PhaseSteps.tsx'
import type { State } from '../lib/lanes.ts'
import type { Provider } from '../lib/providers.ts'
import { useNow } from '../state/useNow.ts'
import type { Track } from '../state/useThread.ts'
import { Mark, tint } from './Mark.tsx'
import { StateLabel } from './StateLabel.tsx'

interface Props { p: Provider; state: State; track?: Track; reviewing: boolean }

const RING = { active: 'animate-glow border-(--c)/60', done: 'border-good/40', error: 'border-bad/60', idle: 'border-line' }

// One AI as a workflow node: its status, a progress rail and the four steps. The text it writes lives in <Chat>.
// data-wire tells <Wires> where to land the connector; the before: dot is its port.
export function ModelCard({ p, state, track, reviewing }: Props) {
  const phase = track?.phase ?? 'idle'
  const active = ACTIVE.has(phase)
  const now = useNow(active)
  const secs = track ? (((track.t1 ?? now) - track.t0) / 1000).toFixed(1) : ''
  const ring = RING[active ? 'active' : phase === 'done' ? 'done' : phase === 'error' ? 'error' : 'idle']

  return (
    <section
      data-wire={p.id}
      data-phase={phase}
      data-state={state}
      style={tint(p.color)}
      className={`group relative flex min-w-44 max-w-64 flex-[1_1_200px] flex-col self-start rounded-xl border bg-panel motion-reduce:animate-none ${ring} before:absolute before:-top-[5px] before:left-1/2 before:-ml-[5px] before:size-2.5 before:rounded-full before:bg-(--c) before:shadow-[0_0_0_3px_var(--color-bg)] first:ml-auto last:mr-auto`}
    >
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Mark p={p} size="sm" />
        <h2 className="mr-auto truncate text-[13px] font-semibold">{p.name}</h2>
        {track ? (
          <span className="flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap text-muted">
            <i className={`size-1.5 rounded-full ${active ? 'animate-beat bg-(--c)' : phase === 'error' ? 'bg-bad' : 'bg-good'} motion-reduce:animate-none`} />
            {reviewing && active ? 'Review · ' : ''}
            {PHASE_LABEL[phase]} {secs}s
          </span>
        ) : (
          <StateLabel state={state} />
        )}
      </header>
      <div className="relative h-0.5 overflow-hidden bg-line">
        {active && <i className="absolute inset-y-0 left-0 w-1/3 animate-scan bg-linear-to-r from-transparent via-(--c) to-transparent motion-reduce:animate-none" />}
        {phase === 'done' && <i className="absolute inset-0 bg-good/70" />}
        {phase === 'error' && <i className="absolute inset-0 bg-bad/70" />}
      </div>
      {track && <PhaseSteps track={track} />}
    </section>
  )
}

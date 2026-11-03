import { ACTIVE, PHASE_LABEL } from './PhaseSteps.tsx'
import type { State } from '../lib/lanes.ts'
import type { Provider } from '../lib/providers.ts'
import type { Track } from '../state/useThread.ts'
import { Mark, tint } from './Mark.tsx'
import { STATE_DOT, STATE_LABEL } from './StateLabel.tsx'

interface Props { p: Provider; state: State; track?: Track; reviewing: boolean }

const FACE = { active: 'border-transparent', done: 'border-good/40', error: 'border-bad/60', idle: 'border-line' }

// One AI as a tiny workflow node: its logo and a status dot. While it works a ring spins around the logo and the dot
// beats; the name and phase are in the tooltip, and the text it writes lives in <Chat>.
// data-wire tells <Wires> where to land the connector; the before: dot is its port.
export function ModelCard({ p, state, track, reviewing }: Props) {
  const phase = track?.phase ?? 'idle'
  const active = ACTIVE.has(phase)
  const face = FACE[active ? 'active' : phase === 'done' ? 'done' : phase === 'error' ? 'error' : 'idle']
  const dot = phase === 'error' ? 'bg-bad' : active ? 'animate-beat bg-(--c)' : phase === 'done' ? 'bg-good' : STATE_DOT[state]
  const label = `${p.name}: ${track ? `${reviewing && active ? 'Review · ' : ''}${PHASE_LABEL[phase]}` : STATE_LABEL[state]}`

  return (
    <section
      data-wire={p.id}
      data-phase={phase}
      data-state={state}
      style={tint(p.color)}
      title={label}
      aria-label={label}
      className="relative size-11 flex-none animate-rise self-start motion-reduce:animate-none before:absolute before:-bottom-[5px] before:left-1/2 before:-ml-[5px] before:size-2.5 before:rounded-full before:bg-(--c) before:shadow-[0_0_0_3px_var(--color-bg)] first:ml-auto last:mr-auto"
    >
      {active && (
        <span className="absolute -inset-[2px] overflow-hidden rounded-[14px]" aria-hidden="true">
          <i className="absolute -inset-3 animate-spin [animation-duration:1.2s] [background:conic-gradient(from_0deg,transparent_45%,var(--c))] motion-reduce:animate-none" />
        </span>
      )}
      <span className={`relative grid size-full place-items-center rounded-xl border bg-panel transition-colors ${face}`}>
        <Mark p={p} />
      </span>
      <i className={`absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-bg motion-reduce:animate-none ${dot}`} />
    </section>
  )
}

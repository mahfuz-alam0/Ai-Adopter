import type { Phase } from '../lib/lanes.ts'
import type { Track } from '../state/useThread.ts'

export const ACTIVE = new Set<Phase>(['connecting', 'sending', 'thinking', 'writing'])
export const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  sending: 'Sending',
  thinking: 'Thinking',
  writing: 'Writing',
  done: 'Done',
  error: 'Failed',
}
const PHASE_TEXT: Partial<Record<Phase, string>> = {
  connecting: '> opening session',
  sending: '> sending prompt',
  thinking: '> waiting for the model',
}
const STEPS = ['Connect', 'Send', 'Think', 'Write']
const AT: Record<Phase, number> = { idle: -1, connecting: 0, sending: 1, thinking: 2, writing: 3, done: 4, error: 0 }

// Four-segment progress of one AI: done segments fill, the current one beats, a failure turns it red.
export function PhaseSteps({ track }: { track: Track }) {
  const failed = track.phase === 'error'
  const at = AT[failed ? (track.from ?? 'connecting') : track.phase]
  return (
    <ol className="m-0 flex list-none gap-1.5 px-3 pt-2 pb-2.5">
      {STEPS.map((s, i) => {
        const bar = i < at ? (track.phase === 'done' ? 'bg-good' : 'bg-(--c)') : i === at ? (failed ? 'bg-bad' : 'animate-beat bg-(--c)') : 'bg-line2'
        const label = i <= at && !failed ? 'text-fg' : i === at ? 'text-bad' : 'text-dim'
        return (
          <li key={s} className="flex-1">
            <i className={`mb-1 block h-[3px] rounded-full motion-reduce:animate-none ${bar}`} />
            <span className={`font-mono text-[9.5px] tracking-wider uppercase ${label}`}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}

// Placeholder while an AI has not produced text yet: a terminal-style status line and shimmering rows.
export function Pending({ phase }: { phase: Phase }) {
  return (
    <div className="font-mono text-xs text-muted">
      {PHASE_TEXT[phase] ?? '> working'}
      <i className="ml-1 inline-block h-3 w-[7px] animate-blink bg-(--c) align-[-2px] motion-reduce:animate-none" />
      <div className="mt-3 space-y-2" aria-hidden="true">
        {[92, 76, 54].map((w, i) => (
          <i key={w} className="block h-2 animate-beat rounded bg-line motion-reduce:animate-none" style={{ width: `${w}%`, animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  )
}

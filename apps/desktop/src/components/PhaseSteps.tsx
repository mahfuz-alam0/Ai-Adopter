import type { Phase } from '../lib/lanes.ts'

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

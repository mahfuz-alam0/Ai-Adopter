import type { State } from '../lib/lanes.ts'

export const STATE_LABEL: Record<State, string> = {
  unknown: 'Not checked',
  'logged-out': 'Not logged in',
  cold: 'Logged in',
  ready: 'Ready',
  busy: 'Working',
  'needs-user': 'Window open',
  checking: 'Checking…',
}

// The dot color follows data-state on the nearest `group` ancestor (row, card or tile).
export const StateLabel = ({ state, className = '' }: { state: State; className?: string }) => (
  <span className={`whitespace-nowrap text-[11.5px] text-muted ${className}`}>
    <span className="mr-1.5 inline-block size-1.5 rounded-full bg-dim align-[1px] group-data-[state=busy]:animate-beat group-data-[state=checking]:animate-beat group-data-[state=checking]:bg-accent group-data-[state=logged-out]:bg-bad group-data-[state=busy]:bg-accent group-data-[state=needs-user]:bg-warn group-data-[state=ready]:bg-good motion-reduce:animate-none" />
    {STATE_LABEL[state]}
  </span>
)

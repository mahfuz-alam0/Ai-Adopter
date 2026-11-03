import type { State } from '../lib/lanes.ts'
import type { Provider } from '../lib/providers.ts'
import { Button } from './Button.tsx'
import { Mark, tint } from './Mark.tsx'
import { StateLabel } from './StateLabel.tsx'

interface Props { p: Provider; state: State; onToggle: () => void; onRemove: () => void }

export function ConnectionTile({ p, state, onToggle, onRemove }: Props) {
  return (
    <article data-state={state} style={tint(p.color)} className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3.5 gap-y-0.5 rounded-xl border border-line bg-panel p-4">
      <Mark p={p} size="lg" className="row-span-2" />
      <h3 className="text-[15px] font-semibold">{p.name}</h3>
      <StateLabel state={state} className="col-start-3 row-start-1 rounded-full border border-line px-2.5 py-0.5" />
      <span className="col-span-2 text-xs text-muted">{new URL(p.url).host}</span>
      <div className="col-span-full mt-3 flex gap-2 border-t border-line pt-3">
        <Button variant={state === 'logged-out' ? 'primary' : 'default'} disabled={state === 'busy' || state === 'checking'} onClick={onToggle}>
          {state === 'needs-user' ? 'Done' : state === 'logged-out' ? 'Log in' : 'Open'}
        </Button>
        <Button variant="ghost" className="ml-auto" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </article>
  )
}

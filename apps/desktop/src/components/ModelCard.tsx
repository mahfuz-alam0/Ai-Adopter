import type { State } from '../lib/lanes.ts'
import type { Provider } from '../lib/providers.ts'
import { Mark, tint } from './Mark.tsx'
import { StateLabel } from './StateLabel.tsx'

interface Props { p: Provider; state: State; answer?: string; review?: string }

// One AI's answer. data-wire tells <Wires> where to land the connector; the before: dot is its port.
export function ModelCard({ p, state, answer, review }: Props) {
  return (
    <section
      data-wire={p.id}
      data-state={state}
      style={tint(p.color)}
      className="group relative flex min-w-52 max-w-[520px] flex-[1_1_260px] flex-col rounded-xl border border-line bg-panel before:absolute before:-top-[5px] before:left-1/2 before:-ml-[5px] before:size-2.5 before:rounded-full before:bg-(--c) before:shadow-[0_0_0_3px_var(--color-bg)] first:ml-auto last:mr-auto"
    >
      <header className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <Mark p={p} size="sm" />
        <h2 className="mr-auto text-[13px] font-semibold">{p.name}</h2>
        <StateLabel state={state} />
      </header>
      <p className="min-h-0 flex-1 overflow-auto px-4 py-3.5 text-[13.5px]/[1.6] whitespace-pre-wrap select-text empty:before:text-dim empty:before:content-['Waiting_for_a_prompt']">
        {answer}
      </p>
      {review !== undefined && (
        <div className="max-h-[45%] overflow-auto border-t border-dashed border-line2 px-4 py-3.5 text-muted select-text">
          <b className="mb-1 block text-xs font-semibold text-fg">Review of the others</b>
          <p className="text-[13.5px]/[1.6] whitespace-pre-wrap">{review}</p>
        </div>
      )}
    </section>
  )
}

import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { Navigate } from 'react-router'
import { focusRing } from '../components/Button.tsx'
import { Console } from '../components/Console.tsx'
import { Matrix } from '../components/Matrix.tsx'
import { ModelCard } from '../components/ModelCard.tsx'
import { Wires } from '../components/Wires.tsx'
import { useHub } from '../state/HubContext.tsx'

// Home: one console in the middle, one card per connected AI wired to it.
// With no AI ready yet there is nothing to talk to, so send the user to /welcome.
export function HubPage() {
  const { providers, stateOf, ready, answers, reviews, matrix, setConnectOpen } = useHub()
  const stage = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const cards = useRef<HTMLDivElement>(null)
  if (!ready) return <Navigate to="/welcome" replace />

  // The hub port wears every connected AI's color.
  const colors = providers.map((p) => p.color)
  const ring = colors.length ? ({ '--ring': `conic-gradient(${[...colors, colors[0]]})` } as CSSProperties) : undefined

  return (
    <div className="flex min-h-0 flex-1 px-6 pt-6 pb-5">
      <div className="relative mx-auto flex min-h-0 min-w-0 max-w-[1500px] flex-1 flex-col" ref={stage} style={ring}>
        <Wires stage={stage} form={form} cards={cards} nodes={providers.map((p) => ({ id: p.id, color: p.color, state: stateOf(p.id) }))} />
        <Console ref={form} />
        <div className="mt-[52px] flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden px-0.5 pt-2 pb-0.5" ref={cards}>
          {providers.map((p) => (
            <ModelCard key={p.id} p={p} state={stateOf(p.id)} answer={answers[p.id]} review={reviews[p.id]} />
          ))}
          <button
            type="button"
            data-wire="add"
            className={`relative flex min-h-23 min-w-0 flex-[0_0_120px] cursor-default flex-col items-center justify-center gap-1 self-start rounded-xl border-[1.5px] border-dashed border-line2 text-muted before:absolute before:-top-[5px] before:left-1/2 before:-ml-[5px] before:size-2.5 before:rounded-full before:bg-line2 before:shadow-[0_0_0_3px_var(--color-bg)] first:ml-auto last:mr-auto hover:border-accent hover:text-fg ${focusRing}`}
            onClick={() => setConnectOpen(true)}
          >
            <span className="text-2xl leading-none">+</span>Connect an AI
          </button>
        </div>
        {matrix && <Matrix data={matrix} />}
      </div>
    </div>
  )
}

import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { Navigate } from 'react-router'
import { focusRing } from '../components/Button.tsx'
import { Chat } from '../components/Chat.tsx'
import { Console } from '../components/Console.tsx'
import { ModelCard } from '../components/ModelCard.tsx'
import { Wires } from '../components/Wires.tsx'
import { useHub } from '../state/HubContext.tsx'

// Home: the prompt node on top wired to one node per AI, then the conversation below.
// With no AI ready yet there is nothing to talk to, so send the user to /welcome.
export function HubPage() {
  const { providers, stateOf, ready, tracks, run, setConnectOpen } = useHub()
  const stage = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const cards = useRef<HTMLDivElement>(null)
  if (!ready) return <Navigate to="/welcome" replace />

  // The hub port wears every connected AI's color.
  const colors = providers.map((p) => p.color)
  const ring = colors.length ? ({ '--ring': `conic-gradient(${[...colors, colors[0]]})` } as CSSProperties) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-5 pb-3">
      <div className="relative mx-auto flex w-full max-w-[1100px] flex-none flex-col" ref={stage} style={ring}>
        <Wires stage={stage} form={form} cards={cards} nodes={providers.map((p) => ({ id: p.id, color: p.color, state: stateOf(p.id), phase: tracks[p.id]?.phase ?? 'idle' }))} />
        <Console ref={form} />
        <div className="mt-11 flex gap-3 overflow-x-auto px-0.5 pt-2 pb-1" ref={cards}>
          {providers.map((p) => (
            <ModelCard key={p.id} p={p} state={stateOf(p.id)} track={tracks[p.id]} reviewing={run.stage === 'reviewing'} />
          ))}
          <button
            type="button"
            data-wire="add"
            className={`relative flex min-h-[78px] min-w-0 flex-[0_0_110px] cursor-default flex-col items-center justify-center gap-0.5 self-start rounded-xl border-[1.5px] border-dashed border-line2 text-xs text-muted before:absolute before:-top-[5px] before:left-1/2 before:-ml-[5px] before:size-2.5 before:rounded-full before:bg-line2 before:shadow-[0_0_0_3px_var(--color-bg)] first:ml-auto last:mr-auto hover:border-accent hover:text-fg ${focusRing}`}
            onClick={() => setConnectOpen(true)}
          >
            <span className="text-xl leading-none">+</span>Connect an AI
          </button>
        </div>
      </div>
      <Chat />
    </div>
  )
}

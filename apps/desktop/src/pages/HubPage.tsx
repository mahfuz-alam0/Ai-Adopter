import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { Navigate } from 'react-router'
import { focusRing } from '../components/Button.tsx'
import { Chat } from '../components/Chat.tsx'
import { Console } from '../components/Console.tsx'
import { ModelCard } from '../components/ModelCard.tsx'
import { Wires } from '../components/Wires.tsx'
import { useHub } from '../state/HubContext.tsx'

// Home, top to bottom: the conversation, then the workflow (one compact node per AI, wired down to the prompt
// box that feeds them), with the prompt box docked at the bottom like a chat app.
// With no AI ready yet there is nothing to talk to, so send the user to /welcome.
export function HubPage() {
  const { providers, stateOf, ready, tracks, run, setConnectOpen } = useHub()
  const stage = useRef<HTMLDivElement>(null)
  const hub = useRef<HTMLDivElement>(null)
  const cards = useRef<HTMLDivElement>(null)
  if (!ready) return <Navigate to="/welcome" replace />

  // The hub port wears every connected AI's color.
  const colors = providers.map((p) => p.color)
  const ring = colors.length ? ({ '--ring': `conic-gradient(${[...colors, colors[0]]})` } as CSSProperties) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Chat />
      <div className="relative mx-auto flex w-full max-w-[1100px] flex-none flex-col" ref={stage} style={ring}>
        <Wires stage={stage} hub={hub} cards={cards} nodes={providers.map((p) => ({ id: p.id, color: p.color, state: stateOf(p.id), phase: tracks[p.id]?.phase ?? 'idle' }))} />
        <div className="flex gap-2 overflow-x-auto px-6 pt-3 pb-2" ref={cards}>
          {providers.map((p) => (
            <ModelCard key={p.id} p={p} state={stateOf(p.id)} track={tracks[p.id]} reviewing={run.stage === 'reviewing'} />
          ))}
          <button
            type="button"
            data-wire="add"
            title="Connect an AI"
            aria-label="Connect an AI"
            className={`relative grid size-11 flex-none cursor-default place-items-center self-start rounded-xl border-[1.5px] border-dashed border-line2 text-lg leading-none text-muted transition-colors before:absolute before:-bottom-[5px] before:left-1/2 before:-ml-[5px] before:size-2.5 before:rounded-full before:bg-line2 before:shadow-[0_0_0_3px_var(--color-bg)] first:ml-auto last:mr-auto hover:border-accent hover:text-fg ${focusRing}`}
            onClick={() => setConnectOpen(true)}
          >
            +
          </button>
        </div>
        <Console ref={hub} />
      </div>
    </div>
  )
}

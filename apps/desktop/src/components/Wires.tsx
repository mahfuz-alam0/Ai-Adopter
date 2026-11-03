import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { Phase, State } from '../lib/lanes.ts'
import { tint } from './Mark.tsx'

// Wire color is the provider's; while a run is going the phase drives dash, direction and motion,
// otherwise the lane's state does. Dashes flow hub to AI going down, AI to hub while it writes.
const DASH = 'stroke-(--c) stroke-2 [stroke-dasharray:2_8] [stroke-linecap:round]'
const BY_PHASE: Partial<Record<Phase, string>> = {
  connecting: `${DASH} animate-flow`,
  sending: `${DASH} animate-flow`,
  thinking: 'stroke-(--c)/70 stroke-2 [stroke-dasharray:1_7] [stroke-linecap:round] animate-beat',
  writing: `${DASH} animate-flow-rev`,
  done: 'stroke-good/70 stroke-2',
  error: 'stroke-bad stroke-2 [stroke-dasharray:2_6]',
}
const BY_STATE: Partial<Record<State, string>> = {
  ready: 'stroke-(--c)',
  busy: `${DASH} animate-flow`,
  'needs-user': 'stroke-warn [stroke-dasharray:2_6]',
  'logged-out': 'stroke-bad [stroke-dasharray:2_6]',
}

interface Props {
  stage: RefObject<HTMLElement | null>
  hub: RefObject<HTMLElement | null>
  cards: RefObject<HTMLElement | null>
  nodes: { id: string; color: string; state: State; phase: Phase }[]
}

// Connectors from the top of the hub (the prompt box) up to the bottom of every element in `cards` that carries data-wire.
// Paths start at the hub, so dashes moving along them travel hub to AI.
export function Wires({ stage, hub, cards, nodes }: Props) {
  const [paths, setPaths] = useState<Record<string, string>>({})

  const draw = useCallback(() => {
    if (!stage.current || !hub.current || !cards.current) return
    const s = stage.current.getBoundingClientRect()
    const f = hub.current.getBoundingClientRect()
    const x1 = f.left + f.width / 2 - s.left
    const y1 = f.top - s.top
    const next: Record<string, string> = {}
    for (const el of cards.current.querySelectorAll<HTMLElement>('[data-wire]')) {
      const c = el.getBoundingClientRect()
      const x2 = c.left + c.width / 2 - s.left
      const y2 = c.bottom - s.top
      const ym = (y1 + y2) / 2
      next[el.dataset.wire!] = `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`
    }
    setPaths((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [stage, hub, cards])

  // Layout can shift on any render (answers grow, banner appears), so measure after each one; the equality check stops loops.
  useLayoutEffect(draw)
  useEffect(() => {
    const ro = new ResizeObserver(draw)
    if (stage.current) ro.observe(stage.current)
    const row = cards.current
    row?.addEventListener('scroll', draw)
    return () => {
      ro.disconnect()
      row?.removeEventListener('scroll', draw)
    }
  }, [draw, stage, cards])

  return (
    <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
      {nodes.map((n) => (
        <path
          key={n.id}
          style={tint(n.color)}
          d={paths[n.id]}
          className={`fill-none stroke-[1.5] stroke-(--c)/55 motion-reduce:animate-none ${(n.phase !== 'idle' ? BY_PHASE[n.phase] : BY_STATE[n.state]) ?? ''}`}
        />
      ))}
      {nodes.map((n) => {
        const d = paths[n.id]
        const down = n.phase === 'connecting' || n.phase === 'sending'
        if (!d || !(down || n.phase === 'writing')) return null
        // Packets ride the wire: the prompt going out, then the answer coming back.
        return [0, 0.45].map((delay) => (
          <circle key={`${n.id}${delay}`} r="3.5" style={tint(n.color)} className="fill-(--c) motion-reduce:hidden">
            <animateMotion
              dur={down ? '0.9s' : '0.7s'}
              begin={`${delay}s`}
              repeatCount="indefinite"
              path={d}
              {...(down ? {} : { keyPoints: '1;0', keyTimes: '0;1', calcMode: 'linear' })}
            />
          </circle>
        ))
      })}
      <path d={paths.add} className="fill-none stroke-line2 stroke-[1.5] [stroke-dasharray:3_6]" />
    </svg>
  )
}

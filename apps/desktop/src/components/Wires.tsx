import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { State } from '../lib/lanes.ts'
import { tint } from './Mark.tsx'

// Wire color is the provider's; state changes opacity, dash and motion.
const WIRE =
  'fill-none stroke-(--c)/55 stroke-[1.5] data-[state=ready]:stroke-(--c) data-[state=busy]:animate-flow data-[state=busy]:stroke-(--c) data-[state=busy]:stroke-2 data-[state=busy]:[stroke-dasharray:2_8] data-[state=busy]:[stroke-linecap:round] data-[state=needs-user]:stroke-warn data-[state=needs-user]:[stroke-dasharray:2_6] data-[state=logged-out]:stroke-bad data-[state=logged-out]:[stroke-dasharray:2_6] motion-reduce:animate-none'

interface Props {
  stage: RefObject<HTMLElement | null>
  form: RefObject<HTMLElement | null>
  cards: RefObject<HTMLElement | null>
  nodes: { id: string; color: string; state: State }[]
}

// Connectors from the console (the hub) to every element in `cards` that carries data-wire.
export function Wires({ stage, form, cards, nodes }: Props) {
  const [paths, setPaths] = useState<Record<string, string>>({})

  const draw = useCallback(() => {
    if (!stage.current || !form.current || !cards.current) return
    const s = stage.current.getBoundingClientRect()
    const f = form.current.getBoundingClientRect()
    const x1 = f.left + f.width / 2 - s.left
    const y1 = f.bottom - s.top
    const next: Record<string, string> = {}
    for (const el of cards.current.querySelectorAll<HTMLElement>('[data-wire]')) {
      const c = el.getBoundingClientRect()
      const x2 = c.left + c.width / 2 - s.left
      const y2 = c.top - s.top
      const ym = (y1 + y2) / 2
      next[el.dataset.wire!] = `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`
    }
    setPaths((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [stage, form, cards])

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
        <path key={n.id} data-state={n.state} style={tint(n.color)} d={paths[n.id]} className={WIRE} />
      ))}
      <path d={paths.add} className="fill-none stroke-line2 stroke-[1.5] [stroke-dasharray:3_6]" />
    </svg>
  )
}

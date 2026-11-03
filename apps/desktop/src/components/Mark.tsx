import type { CSSProperties } from 'react'
import type { Provider } from '../lib/providers.ts'

// Provider color as a CSS variable; utilities like bg-(--c) tint marks, wires and ports from it.
export const tint = (color: string) => ({ '--c': color }) as CSSProperties

const SIZE = {
  sm: 'size-[22px] rounded-md text-xs',
  md: 'size-7 rounded-lg',
  lg: 'size-11 rounded-[10px] text-xl',
}

export function Mark({ p, size = 'md', className = '' }: { p: Provider; size?: keyof typeof SIZE; className?: string }) {
  return (
    <span
      className={`grid flex-none place-items-center bg-(--c)/17 font-semibold text-(--c) ${SIZE[size]} ${className}`}
      style={tint(p.color)}
      aria-hidden="true"
    >
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

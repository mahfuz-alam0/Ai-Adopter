import type { ButtonHTMLAttributes } from 'react'

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

const VARIANT = {
  default: 'border-line bg-panel2 enabled:hover:border-line2 enabled:hover:bg-hover',
  outline: 'border-line bg-transparent enabled:hover:border-line2 enabled:hover:bg-hover',
  ghost: 'border-transparent bg-transparent text-muted enabled:hover:bg-hover',
  primary: 'border-accent bg-accent font-semibold text-on enabled:hover:brightness-110',
}
const SIZE = {
  md: 'px-3 py-1.5',
  sm: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-2.5',
  icon: 'size-[22px] p-0 text-base leading-none',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT
  size?: keyof typeof SIZE
}

// Also used by router links that should look like buttons.
export const buttonClass = (variant: keyof typeof VARIANT = 'default', size: keyof typeof SIZE = 'md', className = '') =>
  `rounded-lg border transition-colors disabled:opacity-50 ${focusRing} ${VARIANT[variant]} ${SIZE[size]} ${className}`

export function Button({ variant = 'default', size = 'md', type = 'button', className = '', ...rest }: Props) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />
}

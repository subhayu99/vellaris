/**
 * Button primitive — ports the JSX prototype's `.btn` family.
 *
 * Variants: primary (gold filled), secondary (outline), ghost (chromeless),
 * danger (outline + danger color). Sizes: default (36px) / sm (28px) / lg (44px).
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'default' | 'sm' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  leading?: ReactNode
  trailing?: ReactNode
  fullWidth?: boolean
}

const BASE =
  'inline-flex items-center gap-2 rounded-md border font-sans font-medium ' +
  'whitespace-nowrap select-none cursor-pointer ' +
  'transition-[background,border-color,color,transform] duration-150 ease-out ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-gold border-gold text-[#1a1408] hover:bg-gold-2 hover:border-gold-2',
  secondary: 'bg-transparent border-line-2 text-fg hover:bg-line hover:border-line-strong',
  ghost: 'bg-transparent border-transparent text-fg-2 hover:text-fg hover:bg-line',
  danger: 'bg-transparent border-line-2 text-danger hover:border-danger hover:bg-danger/10',
}

const SIZE: Record<Size, string> = {
  default: 'h-9 px-3.5 text-[13.5px]',
  sm: 'h-7 px-2.5 text-[12.5px]',
  lg: 'h-11 px-5 text-[14.5px]',
}

export function Button({
  variant = 'secondary',
  size = 'default',
  leading,
  trailing,
  fullWidth,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    BASE,
    VARIANT[variant],
    SIZE[size],
    fullWidth ? 'w-full justify-center' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={classes} {...rest}>
      {leading}
      {children}
      {trailing}
    </button>
  )
}

/**
 * Vellaris wordmark — Newsreader italic, soft regal Latinate feel.
 * Locked from the JSX prototype (Newsreader serif + italic + tight tracking).
 */

export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-5xl',
} as const

export function Wordmark({ size = 'md', className = '' }: WordmarkProps) {
  return (
    <span className={`text-fg font-serif tracking-tight italic ${SIZE[size]} ${className}`.trim()}>
      vellaris
    </span>
  )
}

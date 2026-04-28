/**
 * V-sigil — two intersecting strokes forming a stylized V inside an arch.
 *
 * Direct port of `~/Downloads/Vellaris/src/icons.jsx`. The gradient `id`
 * is namespaced via React's `useId` so multiple sigils on one page don't
 * collide.
 */

import { useId } from 'react'

export interface VSigilProps {
  size?: number
  glow?: boolean
}

export function VSigil({ size = 28, glow = false }: VSigilProps) {
  const gradId = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-gold)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--color-gold)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path
        d="M6 32 V18 a14 14 0 0 1 28 0 V32"
        fill="none"
        stroke="var(--color-gold)"
        strokeOpacity="0.32"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M11 12 L20 30"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M29 12 L20 30"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="20" cy="30" r="1.4" fill="var(--color-gold)" />
      {glow && <circle cx="20" cy="22" r="14" fill="rgba(203,166,90,0.06)" />}
    </svg>
  )
}

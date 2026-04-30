import type { ReactNode } from 'react'

export type DefenseKind = 'ok' | 'no' | 'partial'

interface DefenseBadgeProps {
  kind: DefenseKind
  children?: ReactNode
}

export function DefenseBadge({ kind, children }: DefenseBadgeProps) {
  const label = children ?? (kind === 'ok' ? 'Defended' : kind === 'no' ? 'Out of scope' : 'Partial')
  return (
    <span className={`def-badge ${kind}`}>
      <span className="glyph" aria-hidden="true">
        {kind === 'ok' ? <CheckGlyph /> : kind === 'no' ? <XGlyph /> : <DotGlyph />}
      </span>
      {label}
    </span>
  )
}

function CheckGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 12 5 5L20 6" />
    </svg>
  )
}
function XGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  )
}
function DotGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12h12" />
    </svg>
  )
}

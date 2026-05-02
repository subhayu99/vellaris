/**
 * Spinner — small inline busy indicator.
 *
 * Used in places where we previously only changed button text ("Sharing…")
 * with no visual cue that work was in flight. SVG-based so it scales
 * cleanly and respects currentColor; CSS keyframes are inlined so we
 * don't pay the round-trip of importing a CSS module just for this.
 *
 * For long, narrative-driven crypto operations (signup, login, upload)
 * we keep using EncryptAnim (the champagne-thread). Spinner is for the
 * second-tier interactions: share, revoke, keyblob push/pull/delete,
 * delete document.
 */

import type { CSSProperties } from 'react'

export interface SpinnerProps {
  size?: number
  className?: string
  /** Visually-hidden label for screen readers. */
  label?: string
}

export function Spinner({ size = 14, className = '', label = 'Loading' }: SpinnerProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    animation: 'vellaris-spin 720ms linear infinite',
  }
  return (
    <>
      <style>{`
        @keyframes vellaris-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          [data-vellaris-spinner] { animation-duration: 1800ms !important; }
        }
      `}</style>
      <svg
        data-vellaris-spinner
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" opacity="0.22" />
        <path d="M21 12a9 9 0 0 0-9-9" />
      </svg>
      <span className="sr-only">{label}</span>
    </>
  )
}

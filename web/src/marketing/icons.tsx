/*
 * Marketing-only icons. The app's existing src/components/icons.tsx
 * carries product-flow icons (upload, share, revoke, etc.); these are the
 * ones the landing page needs that don't exist there yet. Mirrors
 * ~/Downloads/Vellaris (1)/landing/icons.jsx.
 */

import type { SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
  children?: React.ReactNode
}

function Ic({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IGitHub({ size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.39-3.88-1.39-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.7.08-.7 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.76.4-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.93 10.93 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.55A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  )
}

export function IArrowRight(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </Ic>
  )
}

export function IChevronDown(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="m6 9 6 6 6-6" />
    </Ic>
  )
}

export function ITerminal(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="m4 7 5 5-5 5" />
      <path d="M12 19h8" />
    </Ic>
  )
}

export function IWindow(p: IconProps) {
  return (
    <Ic {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </Ic>
  )
}

export function IBraces(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="M8 4H6a2 2 0 0 0-2 2v3a3 3 0 0 1-3 3 3 3 0 0 1 3 3v3a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v3a3 3 0 0 0 3 3 3 3 0 0 0-3 3v3a2 2 0 0 1-2 2h-2" />
    </Ic>
  )
}

export function ILock(p: IconProps) {
  return (
    <Ic {...p}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Ic>
  )
}

export function IServer(p: IconProps) {
  return (
    <Ic {...p}>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <circle cx="7.5" cy="7.5" r=".6" fill="currentColor" />
      <circle cx="7.5" cy="16.5" r=".6" fill="currentColor" />
    </Ic>
  )
}

export function ICode(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="m9 8-5 4 5 4" />
      <path d="m15 8 5 4-5 4" />
    </Ic>
  )
}

export function IShield(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6z" />
    </Ic>
  )
}

export function ILogTree(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="M5 4v16" />
      <path d="M5 8h6" />
      <path d="M5 14h6" />
      <path d="M5 20h6" />
    </Ic>
  )
}

export function IKey(p: IconProps) {
  return (
    <Ic {...p}>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 9-9" />
      <path d="m17 5 3 3" />
    </Ic>
  )
}

export function IBadgeOSS(p: IconProps) {
  return (
    <Ic {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </Ic>
  )
}

export function ISun(p: IconProps) {
  return (
    <Ic {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
    </Ic>
  )
}

export function IMoon(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z" />
    </Ic>
  )
}

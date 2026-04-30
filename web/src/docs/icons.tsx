/* Docs-only icons. The marketing icon set covers most of what we need;
 * these fill the gaps for sidebar entries (compass for overview, open
 * book for quickstart) and badge glyphs. */

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

export function ICompass(p: IconProps) {
  return (
    <Ic {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m14.5 9.5-2.5 5-5 2.5 2.5-5z" />
    </Ic>
  )
}

export function IBookOpen(p: IconProps) {
  return (
    <Ic {...p}>
      <path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z" />
      <path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </Ic>
  )
}

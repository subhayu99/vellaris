/**
 * Auth-flow layout shell — used by /connect, /signup, /login.
 *
 * Centered card on a midnight wash, V-sigil + wordmark up top, optional
 * "Connected to <url>" pill at the top-right.
 *
 * Analytics live in the route components themselves (each public route
 * calls `trackPageview` on mount). AuthLayout deliberately does NOT
 * mount the beacon — auto-SPA tracking would bleed pageviews across
 * post-login routes once we navigated past /connect, /signup, /login.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ConnectionPill, VSigil, Wordmark } from '../components/index.ts'

export interface AuthLayoutProps {
  children: ReactNode
  serverUrl?: string | null
  user?: string | null
  onDisconnect?: () => void
}

export function AuthLayout({ children, serverUrl, user, onDisconnect }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <VSigil size={26} />
          <Wordmark size="md" />
        </Link>
        {serverUrl ? (
          <ConnectionPill serverUrl={serverUrl} user={user} onDisconnect={onDisconnect} />
        ) : null}
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6 sm:pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}

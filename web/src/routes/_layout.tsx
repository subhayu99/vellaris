/**
 * Auth-flow layout shell — used by /connect, /signup, /login.
 *
 * Centered card on a midnight wash, V-sigil + wordmark up top, optional
 * "Connected to <url>" pill at the top-right. The dashboard layout (with
 * a real sidebar nav) lands in a follow-up commit.
 */

import type { ReactNode } from 'react'
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
      <header className="flex items-center justify-between px-6 py-5">
        <a href="/" className="flex items-center gap-2.5">
          <VSigil size={26} />
          <Wordmark size="md" />
        </a>
        {serverUrl ? (
          <ConnectionPill serverUrl={serverUrl} user={user} onDisconnect={onDisconnect} />
        ) : null}
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}

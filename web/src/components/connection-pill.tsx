/**
 * "Connected to <url> · <user>" status pill — visible in the nav after
 * a successful server-connect (and optionally after login). Plus a
 * Disconnect action that hands off to the parent.
 */

import type { ReactNode } from 'react'

export interface ConnectionPillProps {
  serverUrl: string
  user?: string | null
  onDisconnect?: () => void
  trailing?: ReactNode
}

export function ConnectionPill({ serverUrl, user, onDisconnect, trailing }: ConnectionPillProps) {
  // Strip protocol for a cleaner display ("vault.example.com" vs "https://vault.example.com").
  const display = serverUrl.replace(/^https?:\/\//, '')
  return (
    <div className="border-line-2 bg-bg-card/60 text-fg-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] backdrop-blur">
      <span aria-hidden className="bg-ok inline-block h-1.5 w-1.5 rounded-full" />
      <span>
        Connected to <span className="text-fg font-mono">{display}</span>
        {user ? (
          <>
            <span className="text-fg-3 mx-1.5">·</span>
            <span className="text-fg">{user}</span>
          </>
        ) : null}
      </span>
      {trailing}
      {onDisconnect && (
        <button
          type="button"
          onClick={onDisconnect}
          className="text-fg-3 hover:bg-line hover:text-fg ml-1 rounded-md px-1.5 py-0.5 text-[11.5px] transition-colors"
        >
          Disconnect
        </button>
      )}
    </div>
  )
}

/**
 * Offline indicator — small amber pill in the dashboard header when
 * `navigator.onLine` is false. Mutations are queued by the SW (Phase 3),
 * reads come from the runtime cache (Phase 2). Clicking the pill is a
 * no-op; the tooltip explains the state for assistive tech + hover.
 *
 * `online` / `offline` events fire on every connection change Chrome /
 * Safari / Firefox can detect. They're a coarse signal — the network
 * may still be unreachable while `onLine === true` (captive portal,
 * DNS failure) — but they cover the common subway / offline-mode case
 * the spec calls out.
 */

import { useEffect, useState } from 'react'

function readOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function OfflineIndicator() {
  const [online, setOnline] = useState<boolean>(() => readOnline())

  useEffect(() => {
    function onOnline() {
      setOnline(true)
    }
    function onOffline() {
      setOnline(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (online) return null

  return (
    <span
      role="status"
      aria-live="polite"
      title="Working offline; mutations will sync when you reconnect."
      className="border-warn/40 bg-warn/10 text-warn inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium"
      data-testid="offline-indicator"
    >
      <span aria-hidden className="bg-warn inline-block h-1.5 w-1.5 rounded-full" />
      Offline
    </span>
  )
}

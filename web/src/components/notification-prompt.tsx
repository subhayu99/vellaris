/**
 * Notification soft-prompt (N1) — mounted on the dashboard.
 *
 * After 1.5s, if the user is in the `default` permission state and the
 * soft-dismiss counter is under its limit, surface a small banner
 * asking whether to enable notifications. Click Enable →
 * Notification.requestPermission() → on grant, subscribeToPush().
 * Click Not now → recordSoftDismissal(); the banner stays out of the
 * way for the rest of the session and grows quieter over repeated
 * sessions.
 *
 * Special case: iOS Safari that hasn't been added to the home screen
 * cannot register for push at all — we surface a "install Vellaris on
 * your home screen first" hint instead, which mirrors the existing
 * InstallPrompt copy but stays focused on notifications.
 */

import { useEffect, useState } from 'react'

import type { VellarisClient } from '../api/index.ts'
import {
  detectPermissionState,
  recordHardDismissal,
  recordSoftDismissal,
  shouldShowSoftPrompt,
  type PermissionState,
} from '../state/notifications.ts'
import { subscribeToPush } from '../state/push-subscription.ts'
import { Button } from './button.tsx'
import { IDownload } from './icons.tsx'

const DEFAULT_APPEAR_DELAY_MS = 1500

export interface NotificationPromptProps {
  client: VellarisClient | null
  /**
   * Tristate availability of /notifications/* on the server. Settings
   * already probes this; we accept the result as a prop so we don't
   * double-probe. ``null`` means "still checking" — render nothing.
   */
  serverAvailable: boolean | null
  /** Override the appearance delay — tests use 0 to skip the warm-up. */
  appearDelayMs?: number
}

export function NotificationPrompt({
  client,
  serverAvailable,
  appearDelayMs = DEFAULT_APPEAR_DELAY_MS,
}: NotificationPromptProps) {
  const [state, setState] = useState<PermissionState | null>(null)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Probe permission state once we know the server can serve push.
  useEffect(() => {
    if (!client || serverAvailable === null || !serverAvailable) return
    let cancelled = false
    void (async () => {
      const result = await detectPermissionState()
      if (!cancelled) setState(result)
    })()
    return () => {
      cancelled = true
    }
  }, [client, serverAvailable])

  // Delay-then-appear so it doesn't fight the dashboard's first paint.
  useEffect(() => {
    if (!state) return
    if (!shouldShowSoftPrompt(state)) return
    if (state.kind === 'granted-subscribed' || state.kind === 'unsupported') return
    const timer = setTimeout(() => setVisible(true), appearDelayMs)
    return () => clearTimeout(timer)
  }, [state, appearDelayMs])

  // Compute hidden directly from the latest signals — keeps the
  // visibility logic out of useEffect (the lint rule rightly objects
  // to setState-in-effect when a derived value would do).
  const hidden =
    dismissed ||
    serverAvailable === false ||
    !state ||
    state.kind === 'granted-subscribed' ||
    state.kind === 'unsupported' ||
    !shouldShowSoftPrompt(state)

  if (hidden || !visible || !state) return null

  if (state.kind === 'ios-needs-install') {
    return (
      <div
        className="border-line bg-bg-card/60 flex flex-col items-start gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        data-testid="notification-prompt-ios"
      >
        <div className="flex items-center gap-3">
          <IDownload size={16} />
          <div className="text-fg-2 text-[13px]">
            <span className="text-fg font-medium">Install Vellaris first.</span> iOS only delivers
            notifications to home-screen apps. Tap Share → Add to Home Screen, then re-open.
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            recordSoftDismissal()
            recordHardDismissal()
            setDismissed(true)
          }}
          aria-label="Dismiss"
          data-testid="notification-prompt-ios-dismiss"
        >
          Not now
        </Button>
      </div>
    )
  }

  if (state.kind === 'denied') {
    return (
      <div
        className="border-line bg-bg-card/60 flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
        data-testid="notification-prompt-denied"
      >
        <div className="text-fg-2 text-[13px]">
          Notifications are blocked at the browser level. Clear the permission in your browser
          settings to re-enable.
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            recordHardDismissal()
            setDismissed(true)
          }}
          aria-label="Dismiss"
          data-testid="notification-prompt-denied-dismiss"
        >
          Dismiss
        </Button>
      </div>
    )
  }

  if (state.kind === 'default') {
    async function enable() {
      if (!client) return
      setBusy(true)
      setError(null)
      try {
        const result = await Notification.requestPermission()
        if (result !== 'granted') {
          setError('Permission was not granted.')
          return
        }
        await subscribeToPush(client)
        setDismissed(true)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div
        className="border-line bg-bg-card/60 flex flex-col items-start gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        data-testid="notification-prompt"
      >
        <div className="flex items-start gap-3">
          <IDownload size={16} />
          <div className="text-fg-2 text-[13px]">
            <span className="text-fg font-medium">
              Get notified when someone shares a document with you?
            </span>
            <div className="text-fg-3 mt-0.5">
              Push payloads are encrypted in transit. Document titles never leave the server.
            </div>
            {error && (
              <div className="text-danger mt-1 text-[12px]" data-testid="notification-prompt-error">
                {error}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void enable()}
            disabled={busy}
            data-testid="notification-prompt-enable"
          >
            {busy ? 'Working…' : 'Enable'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              recordSoftDismissal()
              setDismissed(true)
            }}
            aria-label="Not now"
            data-testid="notification-prompt-dismiss"
          >
            Not now
          </Button>
        </div>
      </div>
    )
  }

  // granted-not-subscribed: re-subscribe silently, no UI.
  if (state.kind === 'granted-not-subscribed' && client) {
    void subscribeToPush(client).catch(() => {
      /* If this fails the banner doesn't render — Settings is the explicit path. */
    })
  }
  return null
}

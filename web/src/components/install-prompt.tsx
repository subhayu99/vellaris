/**
 * Install prompt — surfaces a "Install Vellaris" affordance on supported
 * platforms. Two modes:
 *
 *  - **Chromium / Edge / Android Chrome** — the browser fires
 *    `beforeinstallprompt`. We capture the event, hide the native banner,
 *    and show a small inline link. Clicking it invokes the deferred
 *    `prompt()`.
 *
 *  - **iOS Safari** — the WebKit family doesn't fire the event. If we
 *    detect iOS + not-yet-standalone, we render a three-step "Add to
 *    Home Screen" hint that mirrors the iOS Share-sheet flow.
 *
 *  Already-installed (display-mode: standalone) → component renders nothing.
 */

import { useEffect, useState } from 'react'
import { Button } from './button.tsx'
import { IDownload } from './icons.tsx'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari pre-PWA-modernisation still exposes navigator.standalone.
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPadOS 13+ reports as Mac in UA, but no Mac has touch points + a
  // non-zero maxTouchPoints, so combine the checks.
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

const DISMISS_KEY = 'vellaris.install-prompt.dismissed'

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  // iOS doesn't fire beforeinstallprompt at all; we surface the
  // Share-sheet hint instead. Decided once at mount — `appinstalled`
  // flips it off via the effect below.
  const [showIosHint, setShowIosHint] = useState<boolean>(() => isIOS() && !isStandalone())

  useEffect(() => {
    if (isStandalone()) return

    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setDeferred(null)
      setShowIosHint(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (dismissed) return null

  function handleInstall() {
    if (!deferred) return
    void (async () => {
      await deferred.prompt()
      const choice = await deferred.userChoice
      // Whichever way the user answered, the deferred event is single-
      // shot — drop it. If they dismissed, the browser may surface the
      // native UI again later; we'll capture the next event.
      setDeferred(null)
      if (choice.outcome === 'dismissed') {
        // Don't pester within the same session.
        setDismissed(true)
        try {
          sessionStorage.setItem(DISMISS_KEY, '1')
        } catch {
          /* private browsing — skip persistence */
        }
      }
    })()
  }

  function handleDismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private browsing — skip persistence */
    }
  }

  if (deferred) {
    return (
      <div
        className="border-line bg-bg-card/60 flex flex-col items-start gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        data-testid="install-prompt"
      >
        <div className="flex items-center gap-3">
          <IDownload size={16} />
          <div className="text-fg-2 text-[13px]">
            <span className="text-fg font-medium">Install Vellaris on this device.</span> Launches
            in its own window from your home screen.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleInstall}
            data-testid="install-prompt-action"
          >
            Install
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            data-testid="install-prompt-dismiss"
          >
            Not now
          </Button>
        </div>
      </div>
    )
  }

  if (showIosHint) {
    return (
      <div
        className="border-line bg-bg-card/60 flex flex-col gap-2 rounded-lg border px-4 py-3"
        data-testid="install-prompt-ios"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <IDownload size={16} />
            <span className="text-fg text-[13px] font-medium">
              Install Vellaris on your home screen
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            aria-label="Dismiss install hint"
            data-testid="install-prompt-ios-dismiss"
          >
            ×
          </Button>
        </div>
        <ol className="text-fg-2 ml-7 list-decimal text-[12.5px] leading-relaxed">
          <li>Tap the Share icon (square with up arrow) at the bottom.</li>
          <li>
            Scroll down and tap <span className="text-fg font-medium">Add to Home Screen</span>.
          </li>
          <li>Tap Add — Vellaris launches in its own window from there.</li>
        </ol>
      </div>
    )
  }

  return null
}

/// <reference types="vite-plugin-pwa/react" />
/**
 * Service-worker update banner (U2 prompt-and-reload).
 *
 * vite-plugin-pwa registers the SW for us via `useRegisterSW`. When a new
 * SW is detected (different bytes from the installed one), the hook flips
 * `needRefresh` to true. Clicking Reload posts SKIP_WAITING to the
 * waiting SW, which triggers `controllerchange`, and the page reloads
 * onto the new bundle. Clicking × hides the banner for this session.
 *
 * Why visible-by-design: the SPA is the SW's only user. A silent update
 * would mean every cached fetch could come from a freshly-installed SW
 * the user never agreed to — the U2 update strategy on the trust-model
 * page documents this as the reason we surface a prompt.
 */

import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './button.tsx'

declare const __APP_VERSION__: string

export function SwUpdateBanner() {
  const [dismissed, setDismissed] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // Best-effort: a failed SW registration shouldn't break the SPA.
      // Log so dev tools surface it; users see no banner.
      console.warn('Vellaris SW registration failed', error)
    },
  })

  if (dismissed || !needRefresh) return null

  function handleReload() {
    void updateServiceWorker(true)
  }

  function handleDismiss() {
    setDismissed(true)
    setNeedRefresh(false)
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3"
      data-testid="sw-update-banner"
    >
      <div className="border-line-2 bg-bg-card/95 supports-[backdrop-filter]:bg-bg-card/80 pointer-events-auto mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg supports-[backdrop-filter]:backdrop-blur-md">
        <div className="text-fg-2 text-[13px] leading-snug">
          <span className="text-fg font-medium">Vellaris v{__APP_VERSION__} is available.</span>{' '}
          Reload to update.
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="primary" size="sm" onClick={handleReload} data-testid="sw-update-reload">
            Reload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            aria-label="Dismiss update banner"
            data-testid="sw-update-dismiss"
          >
            ×
          </Button>
        </div>
      </div>
    </div>
  )
}

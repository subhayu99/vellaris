/**
 * Cloudflare Web Analytics beacon — privacy-respecting (no cookies, no PII).
 *
 * Mounted ONLY by AuthLayout (the public connect / signup / login screens).
 * Once the user logs in, AuthLayout unmounts and the beacon's <script> is
 * removed from the DOM. The dashboard / doc-detail / upload / settings
 * screens never fire analytics — those reveal who's using the app and
 * which docs they're touching, which is exactly what Vellaris's privacy
 * model says the server (and any third party) shouldn't see.
 *
 * The beacon token is a Vite env var (`VITE_CF_BEACON_TOKEN`) baked in at
 * build time. Cloudflare beacon tokens are not secrets — they're public
 * identifiers — but they're build-time so dev / test bundles don't ship
 * one.
 */

import { useEffect } from 'react'

const BEACON_TOKEN = import.meta.env.VITE_CF_BEACON_TOKEN as string | undefined
const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

export function CloudflareBeacon() {
  useEffect(() => {
    if (!import.meta.env.PROD) return
    if (!BEACON_TOKEN) return

    // Don't double-inject if a previous AuthLayout mount already added it
    // (StrictMode in dev double-mounts; in prod we only mount once per
    // session anyway).
    const existing = document.querySelector(`script[src="${BEACON_SRC}"]`)
    if (existing) return

    const script = document.createElement('script')
    script.defer = true
    script.src = BEACON_SRC
    script.dataset.cfBeacon = JSON.stringify({ token: BEACON_TOKEN })
    document.body.appendChild(script)

    return () => {
      // On unmount (user logged in → AuthLayout swaps for DashboardLayout),
      // pull the beacon out so subsequent History.pushState transitions
      // inside the authenticated area don't fire pageview events.
      script.remove()
    }
  }, [])

  return null
}

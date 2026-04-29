/**
 * Cloudflare Web Analytics — manual-pageview mode.
 *
 * Each public route (`/connect`, `/signup`, `/login`) calls
 * `trackPageview(path)` on mount; the dashboard / doc-detail / upload /
 * settings screens never call it. The beacon is loaded with
 * `"spa": false`, so it does NOT auto-listen to `history.pushState`,
 * which means the leak that v0.1.x shipped (post-login pageviews still
 * firing because the listeners outlived AuthLayout's unmount) is gone.
 *
 * The token is a Vite env var (`VITE_CF_BEACON_TOKEN`) baked in at build
 * time. Cloudflare beacon tokens are not secrets — they're public
 * identifiers — but they're build-time so dev / test bundles never ship
 * one and never fire. The PROD guard is belt-and-suspenders for any
 * developer who sets the token in `.env.local`.
 */

const BEACON_TOKEN = import.meta.env.VITE_CF_BEACON_TOKEN as string | undefined
const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'
const ENABLED = !!import.meta.env.PROD && !!BEACON_TOKEN

/**
 * Fire a single Cloudflare Web Analytics pageview for the current
 * route. Removes any previously-injected beacon `<script>` first so a
 * fresh insertion forces the beacon IIFE to re-run and emit a new
 * pageview request. The `path` argument is documentation-only — the
 * beacon picks the URL up from `window.location` automatically — but
 * keeps call sites self-describing and makes spy-based tests easy.
 */
export function trackPageview(_path: string): void {
  if (!ENABLED) return

  const existing = document.querySelector('script[data-cf-beacon]')
  if (existing) existing.remove()

  const script = document.createElement('script')
  script.defer = true
  script.src = BEACON_SRC
  script.dataset.cfBeacon = JSON.stringify({ token: BEACON_TOKEN, spa: false })
  document.body.appendChild(script)
}

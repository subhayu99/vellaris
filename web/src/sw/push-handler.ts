/**
 * Vellaris service worker.
 *
 * Compiled by `vite-plugin-pwa`'s `injectManifest` strategy: the build
 * step replaces `self.__WB_MANIFEST` with the precache file list and
 * emits this as `dist/push-handler.js` alongside the SPA bundle.
 *
 * Phases landed:
 *   - Phase 1: shell precache + nav fallback + SKIP_WAITING.
 *   - Phase 2: runtime caching for safe GETs against the user-supplied
 *     Vellaris API origin (the SPA can talk to any host they configured
 *     at /connect, so we match by pathname not origin).
 *
 * Phases pending:
 *   - Phase 3: BackgroundSyncPlugin queue for offline mutations.
 *   - Phase 5: push / notificationclick / pushsubscriptionchange handlers.
 */

import { ExpirationPlugin } from 'workbox-expiration'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

// Pre-cache the SPA shell. The manifest is injected at build time by
// vite-plugin-pwa from dist/'s built assets.
precacheAndRoute(self.__WB_MANIFEST)

// Wipe any precaches left behind by older SW versions; without this
// the install of v0.7.1 would orphan v0.7.0's cache forever.
cleanupOutdatedCaches()

// SPA route handler — every navigation request resolves to the cached
// index.html so deep-links (`/dashboard`, `/doc/<id>`, ...) work offline.
// `createHandlerBoundToURL` looks up the precached entry for the given
// URL (with revisioning) and returns it from the cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// ----------------------------------------------------------------------
// Runtime caching for the Vellaris API.
//
// The API origin is whatever the user picked at /connect — there's no
// single allowlistable host, so route by pathname. Requests from the
// SPA's documents to that arbitrary origin still flow through the SW's
// fetch handler; we just have to match them ourselves.
//
// All routes are GET-only — POST/PUT/DELETE pass through untouched
// (Phase 3 will queue those via BackgroundSyncPlugin).
//
// Auth note: Workbox keys cache by URL, not headers. Two users on the
// same browser would otherwise see each other's responses. Logout in
// the SPA wipes every `vellaris-*` cache; until then, NetworkFirst's
// 3-second timeout means a logged-in user normally gets fresh data and
// the cached fallback is the safety net during offline / flaky links.
// ----------------------------------------------------------------------

const matchPath =
  (re: RegExp) =>
  ({ url }: { url: URL }): boolean =>
    re.test(url.pathname)

// /users/me, /users/by-id/{id}, /users/by-username/{name}
// SWR is fine here — the user record changes rarely and stale-but-quick
// is the right trade for the dashboard's per-row username lookups.
registerRoute(
  matchPath(/^\/users\/(me|by-(id|username)\/[^/]+)$/),
  new StaleWhileRevalidate({ cacheName: 'vellaris-users' }),
  'GET',
)

// GET /documents (?scope=…) — the file list. NetworkFirst with a tight
// timeout so an online dashboard always sees fresh shares; offline,
// the cached list shows the last known state.
registerRoute(
  matchPath(/^\/documents$/),
  new NetworkFirst({ cacheName: 'vellaris-doc-list', networkTimeoutSeconds: 3 }),
  'GET',
)

// GET /documents/{id} — per-doc download (ciphertext + caller's wrapped
// DEK). NetworkFirst lets a fresh share/revoke surface immediately;
// offline, previously-opened docs decrypt from cache. Bound to 100
// entries so we don't grow without limit.
registerRoute(
  matchPath(/^\/documents\/[^/]+$/),
  new NetworkFirst({
    cacheName: 'vellaris-docs',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 100 })],
  }),
  'GET',
)

// GET /webauthn/credentials — Settings list. NetworkFirst so a freshly-
// added/removed passkey shows up; cached fallback keeps Settings legible
// offline.
registerRoute(
  matchPath(/^\/webauthn\/credentials$/),
  new NetworkFirst({ cacheName: 'vellaris-passkeys', networkTimeoutSeconds: 3 }),
  'GET',
)

// ----------------------------------------------------------------------
// Client → SW message handlers.
// ----------------------------------------------------------------------
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined
  if (data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
    return
  }
  if (data?.type === 'CLEAR_VELLARIS_CACHES') {
    // Logout calls this so the next user on the device doesn't read the
    // previous tenant's cached docs/users. Precache stays — the SPA
    // shell isn't tenant-specific.
    event.waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(names.filter((n) => n.startsWith('vellaris-')).map((n) => caches.delete(n))),
        ),
    )
  }
})

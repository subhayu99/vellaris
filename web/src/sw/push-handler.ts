/**
 * Vellaris service worker — Phase 1 (installable shell only).
 *
 * Compiled by `vite-plugin-pwa`'s `injectManifest` strategy: the build
 * step replaces `self.__WB_MANIFEST` with the precache file list and
 * emits this as `dist/sw.js` alongside the SPA bundle.
 *
 * Later phases extend this file (do not rename or recreate):
 *   - Phase 2: runtime caching for safe GETs (StaleWhileRevalidate /
 *     NetworkFirst on /users, /documents, /webauthn/credentials, ...).
 *   - Phase 3: BackgroundSyncPlugin queue for offline mutations.
 *   - Phase 5: push / notificationclick / pushsubscriptionchange handlers.
 *
 * Anything past the bare shell-cache + nav fallback belongs in those
 * phases — keep this file minimal until then.
 */

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

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

// Take over open clients as soon as the new SW activates. The user-
// facing update flow is handled by the SPA's update banner: the banner
// posts SKIP_WAITING after the user clicks Reload, then `controllerchange`
// reloads the page on the new SW.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

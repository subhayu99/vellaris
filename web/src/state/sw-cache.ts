/**
 * SPA → service worker control plane for the runtime caches.
 *
 * Workbox keys cache entries by URL only. A second user signing in on the
 * same browser would otherwise read the previous tenant's cached
 * /documents and /users responses. `clearVellarisCaches()` is called from
 * the dashboard's logout handler to wipe every `vellaris-*` cache (the
 * SPA shell precache stays — it's not tenant-specific).
 *
 * Two paths:
 *   1. Active SW controlling the page → postMessage `CLEAR_VELLARIS_CACHES`,
 *      which runs `caches.delete()` from inside the SW.
 *   2. No SW (dev, first visit before activation) → fall back to deleting
 *      directly from the page, which works for any same-origin cache.
 */
export async function clearVellarisCaches(): Promise<void> {
  if (typeof navigator === 'undefined' || !('caches' in self)) return

  const sw = navigator.serviceWorker?.controller
  if (sw) {
    sw.postMessage({ type: 'CLEAR_VELLARIS_CACHES' })
    return
  }

  try {
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n.startsWith('vellaris-')).map((n) => caches.delete(n)))
  } catch {
    /* no-op — caches API unavailable in this context */
  }
}

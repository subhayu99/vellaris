/**
 * Server URL state — persisted to localStorage so the SPA remembers
 * which Vellaris server the user pointed it at last.
 *
 * The first-load server-connect screen calls {@link setServerUrl} after
 * a successful `/healthz` probe. Subsequent visits skip straight to
 * login if a URL is already cached. {@link clearServerUrl} unsets it
 * (the "Disconnect" affordance in the nav).
 *
 * All ops are guarded with try/catch so they're safe in environments
 * without Web Storage (SSR, locked-down iframes, some test runners).
 */

const STORAGE_KEY = 'vellaris.serverUrl'

export function getServerUrl(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setServerUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''))
  } catch {
    /* swallow — storage unavailable */
  }
}

export function clearServerUrl(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* swallow */
  }
}

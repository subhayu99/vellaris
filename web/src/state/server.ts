/**
 * Server URL state — persisted to localStorage so the SPA remembers
 * which Vellaris server the user pointed it at last.
 *
 * The first-load server-connect screen calls {@link setServerUrl} after
 * a successful `/healthz` probe. Subsequent visits skip straight to
 * login if a URL is already cached. {@link clearServerUrl} unsets it
 * (the "Disconnect" affordance in the nav).
 */

const STORAGE_KEY = 'vellaris.serverUrl'

export function getServerUrl(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

export function setServerUrl(url: string): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, url.replace(/\/+$/, ''))
}

export function clearServerUrl(): void {
  globalThis.localStorage?.removeItem(STORAGE_KEY)
}

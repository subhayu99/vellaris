/**
 * Local key store for the user's wrapped private key.
 *
 * The blob is whatever {@link "../crypto/wrap".wrapPrivateKey} produced —
 * a passphrase-protected envelope that's useless without the user typing
 * their passphrase.
 *
 * Storage tier: an in-memory cache backed by IndexedDB (via `idb-keyval`).
 * The cache is the source of truth at runtime so existing call sites can
 * stay synchronous; writes fan out to IDB asynchronously, and the next
 * page-load's `loadKeystore()` rehydrates the cache from IDB.
 *
 * Migration: prior versions kept this blob in `localStorage` as base64.
 * `loadKeystore()` is idempotent — on first run after the upgrade it
 * copies any existing localStorage entry into IDB and clears the old
 * key. After that it only reads/writes IDB.
 *
 * Why IDB and not plain `localStorage`: IDB stores binary natively (no
 * base64 round-trip), has a much higher quota, and is the only sensible
 * tier once we add file-content caching in a future feature. The
 * wrapped key blob itself doesn't grow, but the migration removes a
 * synchronous-storage gotcha early.
 */

import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'

import { base64ToBytes } from '../api/_b64.ts'

const STORAGE_KEY = 'vellaris.wrappedKey'
const LEGACY_LOCALSTORAGE_KEY = 'vellaris.wrappedKey'

let _cache: Uint8Array | null = null

/**
 * Boot-time hydration. Call once before mounting React. Idempotent — safe
 * to call multiple times. After the first successful run the in-memory
 * cache is the source of truth; later writes fan out to IDB.
 */
export async function loadKeystore(): Promise<void> {
  // Migrate from localStorage if present. If both exist we trust the
  // localStorage value because that's what the running session wrote
  // (a fresh post-upgrade signup goes through setWrappedKey → IDB only,
  // so localStorage having anything means we haven't migrated yet).
  let legacy: string | null = null
  try {
    legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)
  } catch {
    /* swallow */
  }

  if (legacy) {
    try {
      const blob = base64ToBytes(legacy)
      _cache = blob
      await idbSet(STORAGE_KEY, blob)
      try {
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY)
      } catch {
        /* swallow */
      }
      return
    } catch {
      // Corrupt legacy value — fall through to read whatever's in IDB.
    }
  }

  try {
    const fromIdb = (await idbGet(STORAGE_KEY)) as Uint8Array | undefined
    _cache = fromIdb ?? null
  } catch {
    _cache = null
  }
}

export function getWrappedKey(): Uint8Array | null {
  return _cache
}

export function setWrappedKey(blob: Uint8Array): void {
  _cache = blob
  // Fire-and-forget: durability lands on the next microtask. Keeping
  // the public API synchronous lets us reuse the same call sites
  // (signup, settings) without rewriting the surrounding async flow.
  void idbSet(STORAGE_KEY, blob).catch(() => {})
}

export function clearWrappedKey(): void {
  _cache = null
  void idbDel(STORAGE_KEY).catch(() => {})
}

export function hasWrappedKey(): boolean {
  return _cache != null
}

/**
 * Test-only helper: reset the in-memory cache. Used by `test/setup.ts`
 * between tests so state doesn't leak across cases. NOT exported from
 * the package barrel.
 */
export function __resetKeystoreForTests(): void {
  _cache = null
}

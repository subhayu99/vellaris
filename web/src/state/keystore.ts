/**
 * Local key store for the user's wrapped private key.
 *
 * The blob is whatever {@link "../crypto/wrap".wrapPrivateKey} produced —
 * a passphrase-protected envelope that's useless without the user typing
 * their passphrase. localStorage is fine for the foundation slice; an
 * IndexedDB-backed variant lands when the SPA ships file uploads (the
 * blob doesn't grow, but binary data is more idiomatic in IDB).
 *
 * Stored as base64 to round-trip cleanly through the string-only
 * localStorage API.
 */

import { base64ToBytes, bytesToBase64 } from '../api/_b64.ts'

const STORAGE_KEY = 'vellaris.wrappedKey'

export function getWrappedKey(): Uint8Array | null {
  try {
    const b64 = localStorage.getItem(STORAGE_KEY)
    if (!b64) return null
    return base64ToBytes(b64)
  } catch {
    return null
  }
}

export function setWrappedKey(blob: Uint8Array): void {
  try {
    localStorage.setItem(STORAGE_KEY, bytesToBase64(blob))
  } catch {
    /* swallow */
  }
}

export function clearWrappedKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* swallow */
  }
}

export function hasWrappedKey(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) != null
  } catch {
    return false
  }
}

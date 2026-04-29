/**
 * Cache for the unwrapped private-key PEM bytes — module-level memory
 * AND tab-scoped sessionStorage (so a page reload doesn't kick the user
 * back to /login).
 *
 * Trust model: the unwrapped PEM lives in the same trust boundary as the
 * bearer token (already in sessionStorage). An attacker with XSS on the
 * page can already do everything the logged-in user can; reading the PEM
 * doesn't materially widen that. The PEM never touches localStorage (no
 * cross-tab persistence) and is wiped on logout / disconnect / tab close.
 *
 * The module-level variable is the hot path — read once, no JSON parse,
 * no base64 decode. sessionStorage is consulted only on first read after
 * a fresh module load (i.e. page reload), at which point we hydrate the
 * in-memory copy and the rest of the session pays no storage cost.
 */

import { base64ToBytes, bytesToBase64 } from '../api/_b64.ts'

const STORAGE_KEY = 'vellaris.unwrappedPemB64'

let unwrappedPem: Uint8Array | null = null
let hydrated = false

function hydrateFromStorage(): void {
  hydrated = true
  try {
    const b64 = sessionStorage.getItem(STORAGE_KEY)
    if (b64) unwrappedPem = base64ToBytes(b64)
  } catch {
    /* sessionStorage unavailable — module-level cache is the only home */
  }
}

export function setUnwrappedPem(pem: Uint8Array): void {
  unwrappedPem = pem
  hydrated = true
  try {
    sessionStorage.setItem(STORAGE_KEY, bytesToBase64(pem))
  } catch {
    /* swallow — in-memory copy is still good for this tab */
  }
}

export function getUnwrappedPem(): Uint8Array | null {
  if (!hydrated) hydrateFromStorage()
  return unwrappedPem
}

export function clearUnwrappedPem(): void {
  unwrappedPem = null
  hydrated = true
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* swallow */
  }
}

export function hasUnwrappedPem(): boolean {
  return getUnwrappedPem() != null
}

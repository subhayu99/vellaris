/**
 * Module-level cache for the unwrapped private-key PEM bytes.
 *
 * After a successful login the user's wrapped private key is unwrapped
 * once with the passphrase; we stash the resulting PEM here so the
 * dashboard, doc-detail, upload and settings screens can re-import it
 * for OAEP decrypt or OAEP encrypt operations without re-prompting for
 * the passphrase.
 *
 * The cache lives in module scope and is wiped on logout / disconnect /
 * page reload. A reload returns the user to /login (DashboardLayout
 * detects the missing cache and redirects). This is a deliberate choice:
 * the token is in sessionStorage but the unwrapped key never touches
 * any persistent or syncable storage.
 */

let unwrappedPem: Uint8Array | null = null

export function setUnwrappedPem(pem: Uint8Array): void {
  unwrappedPem = pem
}

export function getUnwrappedPem(): Uint8Array | null {
  return unwrappedPem
}

export function clearUnwrappedPem(): void {
  unwrappedPem = null
}

export function hasUnwrappedPem(): boolean {
  return unwrappedPem != null
}

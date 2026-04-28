/**
 * Versioned on-wire format for AES-GCM ciphertext blobs.
 *
 * Mirrors `src/vellaris/core/wire.py`. Every encrypted blob produced by
 * Vellaris carries a 1-byte version prefix so future schemes can be added
 * without breaking old blobs in storage. Decoders MUST reject unknown
 * versions rather than guessing at the layout.
 *
 * Layout for `CIPHERTEXT_V1`:
 *
 *   ┌─────────┬───────────┬─────────┬──────────────┐
 *   │ version │  nonce    │   tag   │  ciphertext  │
 *   │  1 byte │ 12 bytes  │ 16 bytes│   variable   │
 *   └─────────┴───────────┴─────────┴──────────────┘
 *
 * The tag is placed *before* the ciphertext so a streaming reader could
 * verify the tag without buffering the whole ciphertext. We don't stream
 * in v1, but the layout is forward-friendly.
 */

import { WireFormatError } from './errors.ts'
import { NONCE_SIZE, TAG_SIZE, type GcmCiphertext } from './symmetric.ts'

/** Version byte for AES-256-GCM with the layout documented above. */
export const CIPHERTEXT_V1 = 0x01

const HEADER_SIZE = 1 + NONCE_SIZE + TAG_SIZE

/** Serialize `sealed` with the version-prefixed layout. */
export function pack(sealed: GcmCiphertext, options?: { version?: number }): Uint8Array {
  const version = options?.version ?? CIPHERTEXT_V1
  if (version !== CIPHERTEXT_V1) {
    throw new WireFormatError(
      `unknown ciphertext version: 0x${version.toString(16).padStart(2, '0')}`,
    )
  }
  if (sealed.nonce.length !== NONCE_SIZE) {
    throw new WireFormatError(`nonce must be ${NONCE_SIZE} bytes, got ${sealed.nonce.length}`)
  }
  if (sealed.tag.length !== TAG_SIZE) {
    throw new WireFormatError(`tag must be ${TAG_SIZE} bytes, got ${sealed.tag.length}`)
  }

  const out = new Uint8Array(HEADER_SIZE + sealed.ciphertext.length)
  out[0] = version
  out.set(sealed.nonce, 1)
  out.set(sealed.tag, 1 + NONCE_SIZE)
  out.set(sealed.ciphertext, HEADER_SIZE)
  return out
}

/** Parse a version-prefixed blob back into its components. */
export function unpack(blob: Uint8Array): GcmCiphertext {
  if (blob.length < HEADER_SIZE) {
    throw new WireFormatError(`blob too short: ${blob.length} < ${HEADER_SIZE} bytes`)
  }
  const version = blob[0]
  if (version !== CIPHERTEXT_V1) {
    throw new WireFormatError(
      `unknown ciphertext version: 0x${version.toString(16).padStart(2, '0')}`,
    )
  }
  return {
    nonce: blob.slice(1, 1 + NONCE_SIZE),
    tag: blob.slice(1 + NONCE_SIZE, HEADER_SIZE),
    ciphertext: blob.slice(HEADER_SIZE),
  }
}

/**
 * Base64 helpers for binary fields on the Vellaris wire.
 *
 * The server expects `B64Bytes` fields as standard (not URL-safe) base64
 * strings — same as Python's `base64.b64encode`. Emits / parses with
 * `btoa`/`atob` after a one-byte-at-a-time conversion (the WHATWG-spec
 * way that doesn't require ArrayBuffer trickery).
 */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  // chunk to keep the function-call argument list bounded
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + CHUNK, bytes.length)) as unknown as number[],
    )
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

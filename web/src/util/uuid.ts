/**
 * UUID ↔ raw 16-byte conversions.
 *
 * The Vellaris auth challenge requires the client to PSS-sign
 * `challenge_id.bytes + nonce`. Python's `uuid.UUID(s).bytes` returns the
 * 16-byte big-endian representation of the UUID; we need to mirror that
 * here.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function uuidToBytes(uuid: string): Uint8Array {
  if (!UUID_PATTERN.test(uuid)) {
    throw new TypeError(`not a UUID: ${uuid}`)
  }
  const hex = uuid.replace(/-/g, '')
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16)
  }
  return out
}

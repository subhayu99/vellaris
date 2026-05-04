/**
 * Round-trip tests for the WRAPPED_V2_PRF path.
 *
 * The Argon2id-backed v1 round-trip is exercised in `wrap.test.ts`. The
 * v2 path replaces Argon2id with a 32-byte AES key supplied by the
 * caller (in production, the WebAuthn PRF extension's first output).
 * Tests live here so they don't have to import the kdf module just to
 * walk the wire format.
 */

import { describe, expect, it } from 'vitest'

import { DecryptError } from './errors.ts'
import {
  WRAPPED_V2_PRF,
  isPrfWrappedBlob,
  isWrappedBlob,
  unwrapPrivateKeyWithPrf,
  wrapPrivateKeyWithPrf,
} from './wrap.ts'

const PEM = new TextEncoder().encode(
  '-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----\n',
)

function makeKey(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte)
}

describe('PRF-wrapped private keys', () => {
  it('round-trips with the matching key', async () => {
    const key = makeKey(0x42)
    const blob = await wrapPrivateKeyWithPrf(PEM, key)
    expect(blob[0]).toBe(WRAPPED_V2_PRF)
    expect(isPrfWrappedBlob(blob)).toBe(true)
    expect(isWrappedBlob(blob)).toBe(false)
    const out = await unwrapPrivateKeyWithPrf(blob, key)
    // Compare as plain arrays so the test isn't sensitive to whether the
    // unwrapped result is backed by ArrayBuffer vs SharedArrayBuffer.
    expect(Array.from(out)).toEqual(Array.from(PEM))
  })

  it('fails with the wrong key', async () => {
    const blob = await wrapPrivateKeyWithPrf(PEM, makeKey(0x42))
    await expect(unwrapPrivateKeyWithPrf(blob, makeKey(0xff))).rejects.toBeInstanceOf(DecryptError)
  })

  it('rejects keys that are not 32 bytes', async () => {
    await expect(wrapPrivateKeyWithPrf(PEM, new Uint8Array(31))).rejects.toThrow(/32 bytes/)
    const valid = await wrapPrivateKeyWithPrf(PEM, makeKey(0x01))
    await expect(unwrapPrivateKeyWithPrf(valid, new Uint8Array(33))).rejects.toThrow(/32 bytes/)
  })

  it('rejects a v1 blob (passphrase-wrapped) on the PRF unwrap path', async () => {
    const fake = new Uint8Array([0x01, 0xff, 0xee])
    await expect(unwrapPrivateKeyWithPrf(fake, makeKey(0x01))).rejects.toThrow(
      /expected PRF-wrapped/,
    )
  })

  it('flips the version byte to invalidate the AAD bind', async () => {
    const key = makeKey(0x42)
    const blob = await wrapPrivateKeyWithPrf(PEM, key)
    const tampered = new Uint8Array(blob)
    tampered[0] = 0x99
    // The version byte is bound to AES-GCM AAD; touching it changes the
    // AAD and the tag check fails. We surface that as a structural
    // WireFormatError because the version isn't recognized at all.
    await expect(unwrapPrivateKeyWithPrf(tampered, key)).rejects.toThrow(/expected PRF-wrapped/)
  })

  it('isPrfWrappedBlob returns false for empty input', () => {
    expect(isPrfWrappedBlob(new Uint8Array(0))).toBe(false)
    expect(isPrfWrappedBlob(new Uint8Array([WRAPPED_V2_PRF]))).toBe(true)
    expect(isPrfWrappedBlob(new Uint8Array([0x01]))).toBe(false)
  })
})

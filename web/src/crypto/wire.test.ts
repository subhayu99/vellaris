import { describe, it, expect } from 'vitest'
import { CIPHERTEXT_V1, pack, unpack } from './wire.ts'
import { encrypt, randomKey } from './symmetric.ts'
import { WireFormatError } from './errors.ts'

describe('wire envelope', () => {
  it('round-trips a sealed ciphertext', async () => {
    const sealed = await encrypt(new TextEncoder().encode('demo'), randomKey())
    const packed = pack(sealed)
    expect(packed[0]).toBe(CIPHERTEXT_V1)
    expect(packed.length).toBe(
      1 + sealed.nonce.length + sealed.tag.length + sealed.ciphertext.length,
    )

    const unpacked = unpack(packed)
    expect(unpacked.nonce).toEqual(sealed.nonce)
    expect(unpacked.tag).toEqual(sealed.tag)
    expect(unpacked.ciphertext).toEqual(sealed.ciphertext)
  })

  it('rejects unknown versions', () => {
    expect(() => unpack(new Uint8Array([0x99, ...new Uint8Array(28)]))).toThrow(WireFormatError)
  })

  it('rejects truncated blobs', () => {
    expect(() => unpack(new Uint8Array([0x01, 0x02]))).toThrow(WireFormatError)
  })
})

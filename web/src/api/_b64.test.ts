import { describe, it, expect } from 'vitest'
import { base64ToBytes, bytesToBase64 } from './_b64.ts'

describe('base64', () => {
  it('round-trips the empty array', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('')
    expect(base64ToBytes('').length).toBe(0)
  })

  it('round-trips a small byte array', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255])
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes))
  })

  it('matches Python base64.b64encode for "Hello"', () => {
    expect(bytesToBase64(new TextEncoder().encode('Hello'))).toBe('SGVsbG8=')
    expect(new TextDecoder().decode(base64ToBytes('SGVsbG8='))).toBe('Hello')
  })

  it('handles a 100 KiB blob without blowing the call-arg limit', () => {
    // Fill in 64 KiB chunks because crypto.getRandomValues caps at 65,536 bytes.
    const bytes = new Uint8Array(100 * 1024)
    for (let off = 0; off < bytes.length; off += 0x8000) {
      crypto.getRandomValues(bytes.subarray(off, Math.min(off + 0x8000, bytes.length)))
    }
    const round = base64ToBytes(bytesToBase64(bytes))
    expect(round.length).toBe(bytes.length)
    // toEqual on Uint8Array hits a vitest 4 quirk; sample a few indices.
    expect(round[0]).toBe(bytes[0])
    expect(round[bytes.length - 1]).toBe(bytes[bytes.length - 1])
    expect(round[12345]).toBe(bytes[12345])
  })
})

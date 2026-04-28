import { describe, it, expect } from 'vitest'
import { uuidToBytes } from './uuid.ts'

describe('uuidToBytes', () => {
  it('matches Python uuid.UUID().bytes for the canonical zero UUID', () => {
    const bytes = uuidToBytes('00000000-0000-0000-0000-000000000000')
    expect(Array.from(bytes)).toEqual(new Array(16).fill(0))
  })

  it('round-trips a known UUID byte-for-byte', () => {
    // Python: uuid.UUID('12345678-1234-5678-1234-567812345678').bytes ==
    //   b'\x124Vx\x124Vx\x124Vx\x124Vx'
    const bytes = uuidToBytes('12345678-1234-5678-1234-567812345678')
    expect(Array.from(bytes)).toEqual([
      0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x56,
      0x78,
    ])
  })

  it('accepts mixed case', () => {
    const lower = uuidToBytes('aabbccdd-eeff-0011-2233-445566778899')
    const upper = uuidToBytes('AABBCCDD-EEFF-0011-2233-445566778899')
    expect(Array.from(lower)).toEqual(Array.from(upper))
  })

  it('rejects malformed input', () => {
    expect(() => uuidToBytes('not-a-uuid')).toThrow()
    expect(() => uuidToBytes('00000000-0000-0000-0000-00000000000Z')).toThrow()
  })
})

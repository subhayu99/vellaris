import { describe, it, expect } from 'vitest'
import {
  type Argon2Params,
  deriveKey,
  paramsFromDict,
  paramsToDict,
  randomSalt,
  SALT_SIZE,
} from './kdf.ts'
import { KdfError } from './errors.ts'

// Argon2 at production parameters (256 MiB · 3 passes · 4 lanes) takes ~1-2 s.
// Tests use reduced params; the wrap/unwrap round-trip carries the params in
// the blob so byte-level interop with Python at full parameters is verified
// by the fixture tests, not here.
const FAST_PARAMS: Argon2Params = {
  memoryCostKib: 64,
  timeCost: 1,
  parallelism: 1,
  keyLength: 32,
}

describe('kdf (Argon2id)', () => {
  it('returns a salt of the documented length', () => {
    expect(randomSalt()).toHaveLength(SALT_SIZE)
  })

  it('is deterministic for fixed (passphrase, salt, params)', async () => {
    const salt = new Uint8Array(SALT_SIZE).fill(0x42)
    const a = await deriveKey('correct horse battery staple', salt, FAST_PARAMS)
    const b = await deriveKey('correct horse battery staple', salt, FAST_PARAMS)
    expect(a).toEqual(b)
    expect(a).toHaveLength(32)
  })

  it('changes when salt changes', async () => {
    const a = await deriveKey('pw', new Uint8Array(SALT_SIZE).fill(0x01), FAST_PARAMS)
    const b = await deriveKey('pw', new Uint8Array(SALT_SIZE).fill(0x02), FAST_PARAMS)
    expect(a).not.toEqual(b)
  })

  it('changes when passphrase changes', async () => {
    const salt = new Uint8Array(SALT_SIZE).fill(0x42)
    const a = await deriveKey('pw1', salt, FAST_PARAMS)
    const b = await deriveKey('pw2', salt, FAST_PARAMS)
    expect(a).not.toEqual(b)
  })

  it('rejects invalid params', async () => {
    const salt = new Uint8Array(SALT_SIZE).fill(0x42)
    await expect(deriveKey('pw', salt, { ...FAST_PARAMS, parallelism: 0 })).rejects.toBeInstanceOf(
      KdfError,
    )
  })

  it('rejects salts shorter than 8 bytes', async () => {
    await expect(deriveKey('pw', new Uint8Array(4), FAST_PARAMS)).rejects.toBeInstanceOf(KdfError)
  })

  it('round-trips paramsToDict ↔ paramsFromDict', () => {
    const dict = paramsToDict(FAST_PARAMS)
    expect(dict).toEqual({ m: 64, t: 1, p: 1, l: 32 })
    expect(paramsFromDict(dict as unknown as Record<string, unknown>)).toEqual(FAST_PARAMS)
  })
})

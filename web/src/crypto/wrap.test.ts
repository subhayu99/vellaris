import { describe, it, expect } from 'vitest'
import { type Argon2Params } from './kdf.ts'
import { isWrappedBlob, unwrapPrivateKey, wrapPrivateKey, WRAPPED_V1 } from './wrap.ts'
import { DecryptError, WireFormatError } from './errors.ts'

const FAST_PARAMS: Argon2Params = {
  memoryCostKib: 64,
  timeCost: 1,
  parallelism: 1,
  keyLength: 32,
}

const SAMPLE_PEM = new TextEncoder().encode(
  '-----BEGIN PRIVATE KEY-----\nQUJDREVGRw==\n-----END PRIVATE KEY-----\n',
)

describe('wrap', () => {
  it('round-trips a PEM blob with the same passphrase', async () => {
    const blob = await wrapPrivateKey(SAMPLE_PEM, 'correct horse battery staple', {
      params: FAST_PARAMS,
    })
    expect(blob[0]).toBe(WRAPPED_V1)
    const unwrapped = await unwrapPrivateKey(blob, 'correct horse battery staple')
    expect(unwrapped.length).toBe(SAMPLE_PEM.length)
    expect(Array.from(unwrapped)).toEqual(Array.from(SAMPLE_PEM))
  })

  it('fails to unwrap with the wrong passphrase', async () => {
    const blob = await wrapPrivateKey(SAMPLE_PEM, 'correct', { params: FAST_PARAMS })
    await expect(unwrapPrivateKey(blob, 'wrong')).rejects.toBeInstanceOf(DecryptError)
  })

  it('binds salt + params to AAD — flipping a header byte invalidates the tag', async () => {
    const blob = await wrapPrivateKey(SAMPLE_PEM, 'pw', { params: FAST_PARAMS })
    const tampered = new Uint8Array(blob)
    tampered[1] ^= 0x01 // flip a salt byte
    await expect(unwrapPrivateKey(tampered, 'pw')).rejects.toBeInstanceOf(Error)
  })

  it('encodes params_json as canonical sort_keys/sep=,: form', async () => {
    const blob = await wrapPrivateKey(SAMPLE_PEM, 'pw', {
      params: FAST_PARAMS,
      salt: new Uint8Array(16).fill(0x42),
    })
    // params_len at offset 1 + 16 = 17 (uint16 big-endian); params_json starts at 19.
    const paramsLen = (blob[17] << 8) | blob[18]
    const json = new TextDecoder().decode(blob.slice(19, 19 + paramsLen))
    expect(json).toBe('{"l":32,"m":64,"p":1,"t":1}')
  })

  it('rejects unknown wrapped-key versions', async () => {
    const bogus = new Uint8Array(64)
    bogus[0] = 0x99
    await expect(unwrapPrivateKey(bogus, 'pw')).rejects.toBeInstanceOf(WireFormatError)
  })

  it('isWrappedBlob detects the version sentinel', async () => {
    const blob = await wrapPrivateKey(SAMPLE_PEM, 'pw', { params: FAST_PARAMS })
    expect(isWrappedBlob(blob)).toBe(true)
    expect(isWrappedBlob(new Uint8Array([0x02]))).toBe(false)
  })
})

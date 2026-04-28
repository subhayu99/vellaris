/**
 * Byte-level interop with the Python `vellaris.core`.
 *
 * Fixtures in `tests/fixtures/` are produced by `tests/fixtures/generate.py`
 * (run from the repo root with the project's venv: `.venv/bin/python
 * web/tests/fixtures/generate.py`). They lock the wire format on the
 * Python side; this test verifies the TS port at `src/crypto/` decodes
 * them correctly. If a wire format ever drifts, this test fails first.
 *
 * Reverse direction (TS-produced blobs verified by Python) is asserted
 * in-process by the round-trip tests in `src/crypto/*.test.ts` — both
 * sides re-derive the same keys from the same params and salts, so a
 * round-trip pass means the TS encoder is in spec too.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'

import { unwrapPrivateKey } from '../src/crypto/wrap.ts'
import { unpack } from '../src/crypto/wire.ts'
import { decrypt as aesDecrypt } from '../src/crypto/symmetric.ts'
import {
  deserializePrivateKeyForOaep,
  deserializePublicKeyForPss,
  oaepDecrypt,
  pssVerify,
} from '../src/crypto/asymmetric.ts'

interface Meta {
  passphrase: string
  plaintext: string
  dek_hex: string
  argon2_params: { m: number; t: number; p: number; l: number }
  pss_message: string
  description: string
}

const FIXTURES = resolve(import.meta.dirname, './fixtures')

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(FIXTURES, name)))
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16)
  }
  return out
}

let meta: Meta
let wrappedBlob: Uint8Array
let publicPem: Uint8Array
let ciphertextBlob: Uint8Array
let encryptedDek: Uint8Array
let pssSignature: Uint8Array

beforeAll(() => {
  meta = JSON.parse(readFileSync(resolve(FIXTURES, 'meta.json'), 'utf-8')) as Meta
  wrappedBlob = read('wrapped_private_key.bin')
  publicPem = read('public_key.pem')
  ciphertextBlob = read('ciphertext.bin')
  encryptedDek = read('encrypted_dek.bin')
  pssSignature = read('pss_signature.bin')
})

describe('Python ↔ TS interop', () => {
  it('TS unwraps a Python-produced wrapped private key', async () => {
    const pem = await unwrapPrivateKey(wrappedBlob, meta.passphrase)
    const text = new TextDecoder().decode(pem)
    expect(text).toMatch(/^-----BEGIN PRIVATE KEY-----\n/)
    expect(text).toMatch(/-----END PRIVATE KEY-----\n$/)
  })

  it('TS rejects a Python-produced wrapped blob with the wrong passphrase', async () => {
    await expect(unwrapPrivateKey(wrappedBlob, 'wrong-passphrase')).rejects.toThrow()
  })

  it('TS AES-decrypts a Python-produced ciphertext using the known DEK', async () => {
    const dek = fromHex(meta.dek_hex)
    const sealed = unpack(ciphertextBlob)
    const plaintext = await aesDecrypt(sealed, dek)
    expect(new TextDecoder().decode(plaintext)).toBe(meta.plaintext)
  })

  it('TS OAEP-decrypts a DEK that Python wrapped to the same public key', async () => {
    const pem = await unwrapPrivateKey(wrappedBlob, meta.passphrase)
    const privKey = await deserializePrivateKeyForOaep(pem)
    const dek = await oaepDecrypt(encryptedDek, privKey)
    const expected = fromHex(meta.dek_hex)
    expect(dek.length).toBe(expected.length)
    expect(Array.from(dek)).toEqual(Array.from(expected))
  })

  it('TS PSS-verifies a signature Python produced with the matching private key', async () => {
    const pubKey = await deserializePublicKeyForPss(publicPem)
    const message = new TextEncoder().encode(meta.pss_message)
    await expect(pssVerify(message, pssSignature, pubKey)).resolves.toBeUndefined()
  })

  it('TS PSS-verify rejects a tampered signature', async () => {
    const pubKey = await deserializePublicKeyForPss(publicPem)
    const message = new TextEncoder().encode(meta.pss_message)
    const tampered = new Uint8Array(pssSignature)
    tampered[0] ^= 0x01
    await expect(pssVerify(message, tampered, pubKey)).rejects.toThrow()
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import {
  deserializePrivateKeyForOaep,
  deserializePrivateKeyForPss,
  deserializePublicKeyForOaep,
  deserializePublicKeyForPss,
  generateOaepKeypair,
  oaepDecrypt,
  oaepEncrypt,
  pssSign,
  pssVerify,
  serializePrivateKey,
  serializePublicKey,
  type RSAKeyPair,
} from './asymmetric.ts'
import { SignatureError } from './errors.ts'

// RSA-4096 generation is slow (~3-8s). Generate once for the whole suite.
let pair: RSAKeyPair
let privatePem: Uint8Array
let publicPem: Uint8Array

beforeAll(async () => {
  pair = await generateOaepKeypair()
  privatePem = await serializePrivateKey(pair.privateKey)
  publicPem = await serializePublicKey(pair.publicKey)
}, 30_000)

describe('asymmetric (RSA-4096)', () => {
  it('serializes private key as PKCS#8 PEM with 64-char body lines', () => {
    const text = new TextDecoder().decode(privatePem)
    expect(text.startsWith('-----BEGIN PRIVATE KEY-----\n')).toBe(true)
    expect(text.endsWith('-----END PRIVATE KEY-----\n')).toBe(true)
    const body = text
      .replace('-----BEGIN PRIVATE KEY-----\n', '')
      .replace('-----END PRIVATE KEY-----\n', '')
      .split('\n')
      .filter((line) => line.length > 0)
    // All but the last line should be exactly 64 chars
    body.slice(0, -1).forEach((line) => expect(line.length).toBe(64))
  })

  it('serializes public key as SubjectPublicKeyInfo PEM', () => {
    const text = new TextDecoder().decode(publicPem)
    expect(text.startsWith('-----BEGIN PUBLIC KEY-----\n')).toBe(true)
    expect(text.endsWith('-----END PUBLIC KEY-----\n')).toBe(true)
  })

  it('round-trips OAEP encrypt → decrypt via PEM', async () => {
    const pubKey = await deserializePublicKeyForOaep(publicPem)
    const privKey = await deserializePrivateKeyForOaep(privatePem)
    const dek = crypto.getRandomValues(new Uint8Array(32))
    const wrapped = await oaepEncrypt(dek, pubKey)
    expect(wrapped).toHaveLength(512) // RSA-4096 modulus = 512 bytes
    const unwrapped = await oaepDecrypt(wrapped, privKey)
    expect(unwrapped).toEqual(dek)
  })

  it('round-trips PSS sign → verify via PEM', async () => {
    const privKey = await deserializePrivateKeyForPss(privatePem)
    const pubKey = await deserializePublicKeyForPss(publicPem)
    const message = new TextEncoder().encode('challenge_id || nonce')
    const sig = await pssSign(message, privKey)
    expect(sig).toHaveLength(512)
    await expect(pssVerify(message, sig, pubKey)).resolves.toBeUndefined()
  })

  it('PSS verify rejects a bad signature', async () => {
    const privKey = await deserializePrivateKeyForPss(privatePem)
    const pubKey = await deserializePublicKeyForPss(publicPem)
    const sig = await pssSign(new TextEncoder().encode('a'), privKey)
    sig[0] ^= 0x01
    await expect(pssVerify(new TextEncoder().encode('a'), sig, pubKey)).rejects.toBeInstanceOf(
      SignatureError,
    )
  })

  it('PSS verify rejects a signature over a different message', async () => {
    const privKey = await deserializePrivateKeyForPss(privatePem)
    const pubKey = await deserializePublicKeyForPss(publicPem)
    const sig = await pssSign(new TextEncoder().encode('a'), privKey)
    await expect(pssVerify(new TextEncoder().encode('b'), sig, pubKey)).rejects.toBeInstanceOf(
      SignatureError,
    )
  })
})

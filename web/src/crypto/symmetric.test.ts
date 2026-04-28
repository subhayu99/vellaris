import { describe, it, expect } from 'vitest'
import { decrypt, encrypt, randomKey, KEY_SIZE, NONCE_SIZE, TAG_SIZE } from './symmetric.ts'
import { DecryptError } from './errors.ts'

const utf8 = new TextEncoder()

describe('symmetric (AES-256-GCM)', () => {
  it('produces 32-byte keys', () => {
    expect(randomKey()).toHaveLength(KEY_SIZE)
  })

  it('round-trips a short plaintext', async () => {
    const key = randomKey()
    const sealed = await encrypt(utf8.encode('hello vellaris'), key)
    expect(sealed.nonce).toHaveLength(NONCE_SIZE)
    expect(sealed.tag).toHaveLength(TAG_SIZE)
    const decoded = await decrypt(sealed, key)
    expect(new TextDecoder().decode(decoded)).toBe('hello vellaris')
  })

  it('round-trips with associated data', async () => {
    const key = randomKey()
    const aad = utf8.encode('header')
    const sealed = await encrypt(utf8.encode('payload'), key, { associatedData: aad })
    const decoded = await decrypt(sealed, key, { associatedData: aad })
    expect(new TextDecoder().decode(decoded)).toBe('payload')
  })

  it('fails decrypt when AAD differs from encrypt', async () => {
    const key = randomKey()
    const sealed = await encrypt(utf8.encode('payload'), key, { associatedData: utf8.encode('a') })
    await expect(decrypt(sealed, key, { associatedData: utf8.encode('b') })).rejects.toBeInstanceOf(
      DecryptError,
    )
  })

  it('fails decrypt when the tag is tampered', async () => {
    const key = randomKey()
    const sealed = await encrypt(utf8.encode('payload'), key)
    const tamperedTag = new Uint8Array(sealed.tag)
    tamperedTag[0] ^= 0x01
    await expect(
      decrypt({ nonce: sealed.nonce, tag: tamperedTag, ciphertext: sealed.ciphertext }, key),
    ).rejects.toBeInstanceOf(DecryptError)
  })

  it('rejects keys that are not 32 bytes', async () => {
    const shortKey = new Uint8Array(16)
    await expect(encrypt(utf8.encode('x'), shortKey)).rejects.toThrow(/AES-256/)
  })
})

import { beforeAll, describe, expect, it } from 'vitest'
import {
  decryptBundle,
  deserializePrivateKeyForOaep,
  deserializePublicKeyForOaep,
  encryptForRecipients,
  generateOaepKeypair,
  serializePrivateKey,
  serializePublicKey,
  type RSAKeyPair,
} from './index.ts'

let alice: RSAKeyPair
let bob: RSAKeyPair
let alicePrivPem: Uint8Array
let alicePubPem: Uint8Array
let bobPubPem: Uint8Array

beforeAll(async () => {
  alice = await generateOaepKeypair()
  bob = await generateOaepKeypair()
  alicePrivPem = await serializePrivateKey(alice.privateKey)
  alicePubPem = await serializePublicKey(alice.publicKey)
  bobPubPem = await serializePublicKey(bob.publicKey)
}, 30_000)

describe('encryptForRecipients ↔ decryptBundle', () => {
  it('round-trips a small file for the owner', async () => {
    const alicePub = await deserializePublicKeyForOaep(alicePubPem)
    const bundle = await encryptForRecipients({
      plaintext: new TextEncoder().encode('Q1 financials'),
      filename: 'q1.pdf',
      recipients: [{ userId: 'alice', publicKey: alicePub }],
    })
    expect(bundle.access).toHaveLength(1)
    expect(bundle.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/)

    const aliceOaep = await deserializePrivateKeyForOaep(alicePrivPem)
    const decrypted = await decryptBundle({
      ciphertextBlob: bundle.ciphertext,
      encryptedFilenameBlob: bundle.encryptedFilename,
      encryptedDek: bundle.access[0].encryptedDek,
      privateKey: aliceOaep,
    })
    expect(decrypted.filename).toBe('q1.pdf')
    expect(new TextDecoder().decode(decrypted.plaintext)).toBe('Q1 financials')
  })

  it('shares with multiple recipients — each can decrypt independently', async () => {
    const alicePub = await deserializePublicKeyForOaep(alicePubPem)
    const bobPub = await deserializePublicKeyForOaep(bobPubPem)
    const plaintext = new TextEncoder().encode('shared notes')

    const bundle = await encryptForRecipients({
      plaintext,
      filename: 'notes.txt',
      recipients: [
        { userId: 'alice', publicKey: alicePub },
        { userId: 'bob', publicKey: bobPub },
      ],
    })
    expect(bundle.access).toHaveLength(2)
    // Same DEK encrypts ciphertext + filename → identical ciphertext bytes regardless of recipient.
    // Different OAEP wraps per recipient.
    expect(bundle.access[0].encryptedDek).not.toEqual(bundle.access[1].encryptedDek)

    const aliceOaep = await deserializePrivateKeyForOaep(alicePrivPem)
    const bobPriv = await crypto.subtle.exportKey('pkcs8', bob.privateKey)
    const bobOaep = await crypto.subtle.importKey(
      'pkcs8',
      bobPriv,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt'],
    )

    const aliceView = await decryptBundle({
      ciphertextBlob: bundle.ciphertext,
      encryptedFilenameBlob: bundle.encryptedFilename,
      encryptedDek: bundle.access[0].encryptedDek,
      privateKey: aliceOaep,
    })
    const bobView = await decryptBundle({
      ciphertextBlob: bundle.ciphertext,
      encryptedFilenameBlob: bundle.encryptedFilename,
      encryptedDek: bundle.access[1].encryptedDek,
      privateKey: bobOaep,
    })
    expect(new TextDecoder().decode(aliceView.plaintext)).toBe('shared notes')
    expect(new TextDecoder().decode(bobView.plaintext)).toBe('shared notes')
  })

  it('rejects empty recipient list', async () => {
    await expect(
      encryptForRecipients({
        plaintext: new TextEncoder().encode('x'),
        filename: 'x',
        recipients: [],
      }),
    ).rejects.toThrow(/non-empty/)
  })

  it('produces sha256:<64hex> content hash', async () => {
    const alicePub = await deserializePublicKeyForOaep(alicePubPem)
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const bundle = await encryptForRecipients({
      plaintext: new TextEncoder().encode('hello'),
      filename: 'hello.txt',
      recipients: [{ userId: 'alice', publicKey: alicePub }],
    })
    expect(bundle.contentHash).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })
})

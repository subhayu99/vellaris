import { beforeAll, describe, expect, it } from 'vitest'
import {
  decryptBundle,
  deserializePrivateKeyForOaep,
  deserializePublicKeyForOaep,
  encryptForRecipients,
  encryptForRecipientsFromStream,
  generateOaepKeypair,
  readStreamToBytes,
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

// Build a ReadableStream out of a Uint8Array split into N chunks. Mimics
// what `File.stream()` produces in the browser without depending on a
// real File polyfill.
function streamOfChunks(data: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.byteLength) {
        controller.close()
        return
      }
      const end = Math.min(offset + chunkSize, data.byteLength)
      controller.enqueue(data.subarray(offset, end))
      offset = end
    },
  })
}

describe('readStreamToBytes', () => {
  it('reassembles a chunked stream byte-for-byte', async () => {
    const original = new Uint8Array(1_000_000)
    // crypto.getRandomValues caps at 65,536 bytes per call; fill in a
    // deterministic pattern that still varies across the array.
    for (let i = 0; i < original.byteLength; i++) {
      original[i] = (i * 1103515245 + 12345) & 0xff
    }

    const out = await readStreamToBytes(streamOfChunks(original, 64 * 1024))
    expect(out.byteLength).toBe(original.byteLength)
    expect(Array.from(out.subarray(0, 32))).toEqual(Array.from(original.subarray(0, 32)))
    expect(Array.from(out.subarray(out.byteLength - 32))).toEqual(
      Array.from(original.subarray(original.byteLength - 32)),
    )
  })

  it('handles an empty stream', async () => {
    const empty = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })
    const out = await readStreamToBytes(empty)
    expect(out.byteLength).toBe(0)
  })
})

describe('encryptForRecipientsFromStream ↔ decryptBundle', () => {
  it('round-trips a 10 MB blob via the streaming writer path', async () => {
    const data = new Uint8Array(10 * 1024 * 1024)
    crypto.getRandomValues(data.subarray(0, 4096)) // sentinel — keep test cheap; bulk is zeros

    const alicePub = await deserializePublicKeyForOaep(alicePubPem)
    const bundle = await encryptForRecipientsFromStream({
      plaintextStream: streamOfChunks(data, 256 * 1024),
      filename: 'big.bin',
      recipients: [{ userId: 'alice', publicKey: alicePub }],
    })
    expect(bundle.access).toHaveLength(1)

    const aliceOaep = await deserializePrivateKeyForOaep(alicePrivPem)
    const decrypted = await decryptBundle({
      ciphertextBlob: bundle.ciphertext,
      encryptedFilenameBlob: bundle.encryptedFilename,
      encryptedDek: bundle.access[0].encryptedDek,
      privateKey: aliceOaep,
    })
    expect(decrypted.filename).toBe('big.bin')
    expect(decrypted.plaintext.byteLength).toBe(data.byteLength)
    // Spot-check head / tail / middle so we don't pay for a full 10 MB
    // .toEqual diff. The byte-equal property is what matters and the
    // tag verification inside decryptBundle catches any whole-file
    // tampering for free.
    expect(Array.from(decrypted.plaintext.subarray(0, 128))).toEqual(
      Array.from(data.subarray(0, 128)),
    )
    const mid = data.byteLength >> 1
    expect(Array.from(decrypted.plaintext.subarray(mid, mid + 128))).toEqual(
      Array.from(data.subarray(mid, mid + 128)),
    )
    expect(Array.from(decrypted.plaintext.subarray(decrypted.plaintext.byteLength - 128))).toEqual(
      Array.from(data.subarray(data.byteLength - 128)),
    )
  }, 60_000)
})

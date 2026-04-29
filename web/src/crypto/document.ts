/**
 * Document-level encrypt / decrypt that composes the lower-level primitives.
 *
 * Mirrors `src/vellaris/client/crypto.py`. Each upload generates a fresh
 * AES-256 DEK, AES-GCM-encrypts the plaintext *and* the filename, and
 * RSA-OAEP-wraps the DEK once per recipient. The server only ever sees
 * the ciphertexts and the per-recipient wrapped DEKs.
 */

import { bs } from './_buffer.ts'
import { oaepDecrypt, oaepEncrypt } from './asymmetric.ts'
import { decrypt as aesDecrypt, encrypt as aesEncrypt, randomKey } from './symmetric.ts'
import { pack, unpack } from './wire.ts'

export interface Recipient {
  userId: string
  /** RSA-OAEP CryptoKey, already imported via {@link deserializePublicKeyForOaep}. */
  publicKey: CryptoKey
}

export interface EncryptedDocument {
  encryptedFilename: Uint8Array
  contentHash: string
  ciphertext: Uint8Array
  access: { userId: string; encryptedDek: Uint8Array }[]
}

export interface DecryptedDocument {
  filename: string
  plaintext: Uint8Array
}

async function contentHash(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bs(data))
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return `sha256:${hex}`
}

/**
 * Encrypt `plaintext` and `filename` once, wrap the fresh DEK per recipient.
 *
 * The recipient list MUST include the owner (the server enforces this too).
 */
export async function encryptForRecipients({
  plaintext,
  filename,
  recipients,
}: {
  plaintext: Uint8Array
  filename: string
  recipients: Recipient[]
}): Promise<EncryptedDocument> {
  if (recipients.length === 0) {
    throw new Error('recipients must be non-empty (include the owner)')
  }

  const dek = randomKey()
  const sealed = await aesEncrypt(plaintext, dek)
  const sealedFilename = await aesEncrypt(new TextEncoder().encode(filename), dek)

  const access = await Promise.all(
    recipients.map(async (r) => ({
      userId: r.userId,
      encryptedDek: await oaepEncrypt(dek, r.publicKey),
    })),
  )

  return {
    encryptedFilename: pack(sealedFilename),
    contentHash: await contentHash(plaintext),
    ciphertext: pack(sealed),
    access,
  }
}

/**
 * Drain a `ReadableStream<Uint8Array>` into a single contiguous
 * `Uint8Array`. Reads chunk-by-chunk so a megabyte-class file doesn't
 * have to be allocated up front — the GC can free each chunk as we
 * grow the destination on the next iteration.
 *
 * The output buffer is built in two passes: first we collect chunks
 * into a list while tallying the total length, then we allocate once
 * and copy. That keeps the live memory ceiling at roughly
 * `peak(stream chunks) + final size` instead of `2× final size`.
 */
export async function readStreamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.byteLength > 0) {
        chunks.push(value)
        total += value.byteLength
      }
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * Streaming-writer variant of {@link encryptForRecipients}. Accepts the
 * plaintext as a `ReadableStream` (`file.stream()` from a `File`) so
 * the upload flow doesn't have to call `file.arrayBuffer()` — that one
 * call hits ArrayBuffer size limits on multi-hundred-megabyte files in
 * Safari, and even where it doesn't it inflates peak memory by holding
 * the File and the ArrayBuffer simultaneously.
 *
 * AES-GCM is still applied as a single operation: WebCrypto doesn't
 * expose a streaming GCM mode, so the assembled plaintext is sealed in
 * one shot. That keeps the wire format byte-identical to the existing
 * `encryptForRecipients` output. True chunked encryption (multiple
 * tags, streaming verification on the reader) is a v0.3+ wire format.
 */
export async function encryptForRecipientsFromStream({
  plaintextStream,
  filename,
  recipients,
}: {
  plaintextStream: ReadableStream<Uint8Array>
  filename: string
  recipients: Recipient[]
}): Promise<EncryptedDocument> {
  const plaintext = await readStreamToBytes(plaintextStream)
  return encryptForRecipients({ plaintext, filename, recipients })
}

/** Reverse of {@link encryptForRecipients} for a single recipient (the current user). */
export async function decryptBundle({
  ciphertextBlob,
  encryptedFilenameBlob,
  encryptedDek,
  privateKey,
}: {
  ciphertextBlob: Uint8Array
  encryptedFilenameBlob: Uint8Array
  encryptedDek: Uint8Array
  privateKey: CryptoKey
}): Promise<DecryptedDocument> {
  const dek = await oaepDecrypt(encryptedDek, privateKey)
  const plaintext = await aesDecrypt(unpack(ciphertextBlob), dek)
  const filename = new TextDecoder().decode(await aesDecrypt(unpack(encryptedFilenameBlob), dek))
  return { filename, plaintext }
}

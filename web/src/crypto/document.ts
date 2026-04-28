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

/**
 * AES-256-GCM symmetric encryption.
 *
 * Mirrors `src/vellaris/core/symmetric.py`. The unit operates on raw bytes
 * and returns the three GCM components (nonce, tag, ciphertext) separately.
 * Composing them into the on-wire envelope is the responsibility of
 * {@link "./wire".pack}.
 *
 * Only AES-256 is supported. The wire format and key length are locked
 * across the project so there is exactly one knob to audit.
 */

import { bs } from './_buffer.ts'
import { DecryptError } from './errors.ts'

export const KEY_SIZE = 32
/** GCM nonce length in bytes — 96 bits, NIST-recommended. */
export const NONCE_SIZE = 12
/** GCM authentication tag length in bytes. */
export const TAG_SIZE = 16

export interface GcmCiphertext {
  readonly nonce: Uint8Array
  readonly tag: Uint8Array
  readonly ciphertext: Uint8Array
}

/** Returns a fresh 32-byte AES-256 key from the OS CSPRNG. */
export function randomKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_SIZE))
}

function validateKey(key: Uint8Array): void {
  if (key.length !== KEY_SIZE) {
    throw new TypeError(`key must be ${KEY_SIZE} bytes (AES-256), got ${key.length}`)
  }
}

async function importKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bs(key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/**
 * Encrypt `plaintext` under `key` with a fresh random nonce.
 *
 * `associatedData` is authenticated but not encrypted; pass the same value
 * to {@link decrypt} or the tag check will fail.
 */
export async function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  options?: { associatedData?: Uint8Array },
): Promise<GcmCiphertext> {
  validateKey(key)
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE))
  const cryptoKey = await importKey(key)
  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: nonce,
    tagLength: TAG_SIZE * 8,
  }
  if (options?.associatedData) {
    params.additionalData = bs(options.associatedData)
  }
  const sealedBuffer = await crypto.subtle.encrypt(params, cryptoKey, bs(plaintext))
  // WebCrypto returns ciphertext concatenated with the tag — same as `cryptography`.
  const sealed = new Uint8Array(sealedBuffer)
  const ciphertext = sealed.slice(0, sealed.length - TAG_SIZE)
  const tag = sealed.slice(sealed.length - TAG_SIZE)
  return { nonce, tag, ciphertext }
}

/** Authenticate and decrypt `sealed`. Throws {@link DecryptError} on tag mismatch. */
export async function decrypt(
  sealed: GcmCiphertext,
  key: Uint8Array,
  options?: { associatedData?: Uint8Array },
): Promise<Uint8Array> {
  validateKey(key)
  if (sealed.nonce.length !== NONCE_SIZE) {
    throw new DecryptError(`nonce must be ${NONCE_SIZE} bytes, got ${sealed.nonce.length}`)
  }
  if (sealed.tag.length !== TAG_SIZE) {
    throw new DecryptError(`tag must be ${TAG_SIZE} bytes, got ${sealed.tag.length}`)
  }

  const cryptoKey = await importKey(key)
  const sealedBytes = new Uint8Array(sealed.ciphertext.length + sealed.tag.length)
  sealedBytes.set(sealed.ciphertext, 0)
  sealedBytes.set(sealed.tag, sealed.ciphertext.length)

  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: bs(sealed.nonce),
    tagLength: TAG_SIZE * 8,
  }
  if (options?.associatedData) {
    params.additionalData = bs(options.associatedData)
  }
  try {
    const plaintext = await crypto.subtle.decrypt(params, cryptoKey, sealedBytes)
    return new Uint8Array(plaintext)
  } catch (cause) {
    throw new DecryptError('AES-GCM tag verification failed', { cause })
  }
}

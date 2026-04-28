/**
 * RSA-4096 asymmetric primitives.
 *
 * Mirrors `src/vellaris/core/asymmetric.py`. Two operations live here:
 *
 * - **OAEP encryption / decryption** for wrapping per-document AES keys
 *   (DEKs) under a recipient's public key. SHA-256 is used both as the
 *   hash and as MGF1's underlying hash. WebCrypto binds MGF1 to the same
 *   hash as the import-time `hash`, so importing with `SHA-256` is enough.
 * - **RSASSA-PSS signing / verification** for the auth challenge. PSS is
 *   a different padding from OAEP — sign/verify must NOT reuse the OAEP
 *   key handles (the original PoC's bug).
 *
 * Keys are exchanged as PEM (PKCS#8 for private, SubjectPublicKeyInfo for
 * public). Both formats round-trip with Python's `cryptography` library.
 */

import { bs } from './_buffer.ts'
import { DecryptError, KeyFormatError, SignatureError } from './errors.ts'

export const KEY_SIZE_BITS = 4096
export const PUBLIC_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]) // 65537

/** PSS salt length in bytes — matches Python's `padding.PSS.DIGEST_LENGTH` for SHA-256. */
export const PSS_SALT_LENGTH = 32

export interface RSAKeyPair {
  readonly privateKey: CryptoKey
  readonly publicKey: CryptoKey
}

/**
 * RSA-4096 keys carry one of two algorithm identifiers depending on usage:
 * `RSA-OAEP` (wrap/unwrap DEKs) or `RSA-PSS` (sign/verify auth challenge).
 * Re-using a key handle across both operations is unsafe (different padding,
 * different attack model). We keep them separate by importing twice when
 * needed, and by generating two distinct keypairs only when the caller asks.
 *
 * For Vellaris we keep ONE underlying RSA private key per user, but wrap it
 * under both algorithm types at use-time via {@link reimportPrivateKeyForPss}.
 */

function pemDecode(pem: string, label: string): Uint8Array {
  const begin = `-----BEGIN ${label}-----`
  const end = `-----END ${label}-----`
  const beginIdx = pem.indexOf(begin)
  const endIdx = pem.indexOf(end)
  if (beginIdx < 0 || endIdx < 0 || endIdx < beginIdx) {
    throw new KeyFormatError(`PEM missing ${label} delimiters`)
  }
  const body = pem.slice(beginIdx + begin.length, endIdx).replace(/\s+/g, '')
  if (!body) {
    throw new KeyFormatError(`PEM body for ${label} is empty`)
  }
  try {
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch (cause) {
    throw new KeyFormatError(`PEM body for ${label} is not valid base64`, { cause })
  }
}

function pemEncode(der: Uint8Array, label: string): string {
  let binary = ''
  for (let i = 0; i < der.length; i++) {
    binary += String.fromCharCode(der[i])
  }
  const b64 = btoa(binary)
  // Python's `cryptography` writes 64-char lines — match that for byte-equality
  // with fixtures coming out of the CLI / SDK.
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64))
  }
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

/** Generate a fresh RSA-4096 OAEP keypair. The same modulus is used for PSS via re-import. */
export async function generateOaepKeypair(): Promise<RSAKeyPair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: KEY_SIZE_BITS,
      publicExponent: PUBLIC_EXPONENT,
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )
  return { privateKey: pair.privateKey, publicKey: pair.publicKey }
}

/** PEM-serialize an RSA private key as unencrypted PKCS#8 (matches Python output). */
export async function serializePrivateKey(privateKey: CryptoKey): Promise<Uint8Array> {
  const der = await crypto.subtle.exportKey('pkcs8', privateKey)
  return new TextEncoder().encode(pemEncode(new Uint8Array(der), 'PRIVATE KEY'))
}

/** PEM-serialize an RSA public key as SubjectPublicKeyInfo (matches Python output). */
export async function serializePublicKey(publicKey: CryptoKey): Promise<Uint8Array> {
  const der = await crypto.subtle.exportKey('spki', publicKey)
  return new TextEncoder().encode(pemEncode(new Uint8Array(der), 'PUBLIC KEY'))
}

/** Load a PEM-encoded RSA private key for OAEP decryption. */
export async function deserializePrivateKeyForOaep(pem: Uint8Array | string): Promise<CryptoKey> {
  const text = typeof pem === 'string' ? pem : new TextDecoder().decode(pem)
  const der = pemDecode(text, 'PRIVATE KEY')
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      bs(der),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt'],
    )
  } catch (cause) {
    throw new KeyFormatError('failed to load private key for OAEP', { cause })
  }
}

/** Load a PEM-encoded RSA private key for PSS signing. Different padding, different key handle. */
export async function deserializePrivateKeyForPss(pem: Uint8Array | string): Promise<CryptoKey> {
  const text = typeof pem === 'string' ? pem : new TextDecoder().decode(pem)
  const der = pemDecode(text, 'PRIVATE KEY')
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      bs(der),
      { name: 'RSA-PSS', hash: 'SHA-256' },
      true,
      ['sign'],
    )
  } catch (cause) {
    throw new KeyFormatError('failed to load private key for PSS', { cause })
  }
}

/** Load a PEM-encoded RSA public key for OAEP encryption. */
export async function deserializePublicKeyForOaep(pem: Uint8Array | string): Promise<CryptoKey> {
  const text = typeof pem === 'string' ? pem : new TextDecoder().decode(pem)
  const der = pemDecode(text, 'PUBLIC KEY')
  try {
    return await crypto.subtle.importKey(
      'spki',
      bs(der),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt'],
    )
  } catch (cause) {
    throw new KeyFormatError('failed to load public key for OAEP', { cause })
  }
}

/** Load a PEM-encoded RSA public key for PSS verification. */
export async function deserializePublicKeyForPss(pem: Uint8Array | string): Promise<CryptoKey> {
  const text = typeof pem === 'string' ? pem : new TextDecoder().decode(pem)
  const der = pemDecode(text, 'PUBLIC KEY')
  try {
    return await crypto.subtle.importKey(
      'spki',
      bs(der),
      { name: 'RSA-PSS', hash: 'SHA-256' },
      true,
      ['verify'],
    )
  } catch (cause) {
    throw new KeyFormatError('failed to load public key for PSS', { cause })
  }
}

/** RSA-OAEP-SHA256 encryption. Used for wrapping AES DEKs per recipient. */
export async function oaepEncrypt(
  plaintext: Uint8Array,
  publicKey: CryptoKey,
): Promise<Uint8Array> {
  const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, bs(plaintext))
  return new Uint8Array(ct)
}

/** RSA-OAEP-SHA256 decryption. */
export async function oaepDecrypt(
  ciphertext: Uint8Array,
  privateKey: CryptoKey,
): Promise<Uint8Array> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, bs(ciphertext))
    return new Uint8Array(pt)
  } catch (cause) {
    throw new DecryptError('RSA-OAEP decryption failed', { cause })
  }
}

/** RSASSA-PSS-SHA256 signature with salt_length=32 (matches Python's PSS.DIGEST_LENGTH). */
export async function pssSign(message: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign(
    { name: 'RSA-PSS', saltLength: PSS_SALT_LENGTH },
    privateKey,
    bs(message),
  )
  return new Uint8Array(sig)
}

/** Verify an RSA-PSS-SHA256 signature. Throws {@link SignatureError} on failure. */
export async function pssVerify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: CryptoKey,
): Promise<void> {
  const ok = await crypto.subtle.verify(
    { name: 'RSA-PSS', saltLength: PSS_SALT_LENGTH },
    publicKey,
    bs(signature),
    bs(message),
  )
  if (!ok) {
    throw new SignatureError('RSA-PSS signature verification failed')
  }
}

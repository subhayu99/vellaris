/**
 * Argon2id passphrase-based key derivation via hash-wasm.
 *
 * Mirrors `src/vellaris/core/kdf.py`. Argon2id is the password-hashing
 * algorithm specified by RFC 9106 and recommended by OWASP for passphrase-
 * derived keys. We use its "raw" mode because we want the bytes that
 * become an AES-256 key.
 *
 * Defaults are intentionally conservative and match the Python side
 * byte-for-byte:
 * - memory_cost = 256 MiB (KiB-encoded as 262144)
 * - time_cost   = 3 passes
 * - parallelism = 4 lanes
 * - salt        = 16 bytes
 * - hash_len    = 32 bytes (AES-256 key)
 *
 * Tuning these per call is supported via {@link Argon2Params} — the
 * wrapped-key blob format carries them alongside the ciphertext so the
 * verifier can re-derive without out-of-band coordination.
 */

import { argon2id } from 'hash-wasm'

import { KdfError } from './errors.ts'

export const SALT_SIZE = 16

export const DEFAULT_MEMORY_COST_KIB = 256 * 1024 // 256 MiB
export const DEFAULT_TIME_COST = 3
export const DEFAULT_PARALLELISM = 4
export const DEFAULT_KEY_LENGTH = 32

export interface Argon2Params {
  /** Memory cost in KiB (Argon2's native unit). */
  readonly memoryCostKib: number
  /** Pass count. */
  readonly timeCost: number
  /** Lane count. */
  readonly parallelism: number
  /** Output key length in bytes. */
  readonly keyLength: number
}

export const DEFAULT_PARAMS: Argon2Params = Object.freeze({
  memoryCostKib: DEFAULT_MEMORY_COST_KIB,
  timeCost: DEFAULT_TIME_COST,
  parallelism: DEFAULT_PARALLELISM,
  keyLength: DEFAULT_KEY_LENGTH,
})

function validateParams(p: Argon2Params): void {
  if (p.memoryCostKib < 8) {
    throw new KdfError(`memoryCostKib must be >= 8 KiB, got ${p.memoryCostKib}`)
  }
  if (p.timeCost < 1) {
    throw new KdfError(`timeCost must be >= 1, got ${p.timeCost}`)
  }
  if (p.parallelism < 1) {
    throw new KdfError(`parallelism must be >= 1, got ${p.parallelism}`)
  }
  if (p.keyLength < 4) {
    throw new KdfError(`keyLength must be >= 4 bytes, got ${p.keyLength}`)
  }
  // Argon2 internal constraint: memory >= 8 KiB per lane.
  if (p.memoryCostKib < 8 * p.parallelism) {
    throw new KdfError(
      `memoryCostKib (${p.memoryCostKib}) must be >= 8 * parallelism (${8 * p.parallelism})`,
    )
  }
}

/** Wire-format params dict — matches `Argon2Params.to_dict()` on the Python side. */
export interface Argon2ParamsDict {
  m: number
  t: number
  p: number
  l: number
}

export function paramsToDict(p: Argon2Params): Argon2ParamsDict {
  return {
    m: p.memoryCostKib,
    t: p.timeCost,
    p: p.parallelism,
    l: p.keyLength,
  }
}

export function paramsFromDict(d: Record<string, unknown>): Argon2Params {
  try {
    const params: Argon2Params = {
      memoryCostKib: Number(d.m),
      timeCost: Number(d.t),
      parallelism: Number(d.p),
      keyLength: Number(d.l),
    }
    if (
      !Number.isInteger(params.memoryCostKib) ||
      !Number.isInteger(params.timeCost) ||
      !Number.isInteger(params.parallelism) ||
      !Number.isInteger(params.keyLength)
    ) {
      throw new TypeError('Argon2 params must be integers')
    }
    validateParams(params)
    return params
  } catch (cause) {
    throw new KdfError(`invalid Argon2 params: ${(cause as Error).message}`, { cause })
  }
}

/** Returns a fresh 16-byte salt from the OS CSPRNG. */
export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_SIZE))
}

/**
 * Derive a raw key from `passphrase` and `salt` using Argon2id.
 *
 * The passphrase is encoded as UTF-8 if a string is given. Returns raw
 * bytes (not an encoded hash string), suitable for direct use as an
 * AES-256 key.
 */
export async function deriveKey(
  passphrase: Uint8Array | string,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_PARAMS,
): Promise<Uint8Array> {
  validateParams(params)
  if (salt.length < 8) {
    throw new KdfError(`salt must be >= 8 bytes, got ${salt.length}`)
  }
  const password =
    typeof passphrase === 'string' ? new TextEncoder().encode(passphrase) : passphrase

  const result = await argon2id({
    password,
    salt,
    parallelism: params.parallelism,
    iterations: params.timeCost,
    memorySize: params.memoryCostKib,
    hashLength: params.keyLength,
    outputType: 'binary',
  })
  return result
}

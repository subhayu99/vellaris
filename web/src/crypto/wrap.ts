/**
 * Passphrase-wrapped private-key blobs.
 *
 * Mirrors `src/vellaris/core/wrap.py`. Combines {@link "./kdf".deriveKey}
 * with {@link "./symmetric".encrypt} to turn a PEM-encoded private key
 * into a single bytestring storable in localStorage / IndexedDB or
 * pushable (opt-in) to the server as an opaque blob. The server cannot
 * decrypt the result because the passphrase never leaves the client.
 *
 * Layout for `WRAPPED_V1`:
 *
 *   ┌─────────┬──────────┬──────────────┬──────────────┬──────────────────┐
 *   │ version │   salt   │ params_len   │ params_json  │  inner ciphertext│
 *   │  1 byte │ 16 bytes │   2 bytes    │   variable   │   (wire envelope)│
 *   └─────────┴──────────┴──────────────┴──────────────┴──────────────────┘
 *
 * `params_json` is the JSON encoding of {@link Argon2ParamsDict} with
 * `sort_keys=True, separators=(',', ':')` — Python's canonical compact form.
 * The version byte, salt, and params bytes are bound to the AES-GCM
 * ciphertext via the AEAD's associated-data slot, so altering them after
 * wrapping invalidates the tag and produces a `DecryptError` at unwrap time.
 */

import { WireFormatError } from './errors.ts'
import {
  type Argon2Params,
  DEFAULT_PARAMS,
  SALT_SIZE,
  deriveKey,
  paramsFromDict,
  paramsToDict,
  randomSalt,
} from './kdf.ts'
import { decrypt as aesDecrypt, encrypt as aesEncrypt } from './symmetric.ts'
import { pack, unpack } from './wire.ts'

export const WRAPPED_V1 = 0x01

const PARAMS_LEN_FIELD = 2 // uint16 big-endian
const HEADER_FIXED = 1 + SALT_SIZE + PARAMS_LEN_FIELD

/**
 * Canonical JSON encoding for Argon2 params — matches Python's
 * `json.dumps(p.to_dict(), sort_keys=True, separators=(',', ':'))`.
 *
 * The dict has fixed keys (`l, m, p, t` after sorting) so we hand-roll
 * the encoder instead of pulling in a canonical-json library.
 */
function encodeParamsJson(p: Argon2Params): Uint8Array {
  const dict = paramsToDict(p)
  // Sorted alphabetically: l, m, p, t — matches Python sort_keys=True.
  const json = `{"l":${dict.l},"m":${dict.m},"p":${dict.p},"t":${dict.t}}`
  return new TextEncoder().encode(json)
}

function associatedData(version: number, salt: Uint8Array, paramsBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + salt.length + paramsBytes.length)
  out[0] = version
  out.set(salt, 1)
  out.set(paramsBytes, 1 + salt.length)
  return out
}

/**
 * Encrypt `pemBytes` with a key derived from `passphrase`.
 *
 * Returns a single bytestring suitable for writing to localStorage. The
 * salt and Argon2 parameters are stored alongside so the same passphrase
 * can re-derive the key at unwrap time.
 */
export async function wrapPrivateKey(
  pemBytes: Uint8Array,
  passphrase: Uint8Array | string,
  options?: { params?: Argon2Params; salt?: Uint8Array },
): Promise<Uint8Array> {
  const params = options?.params ?? DEFAULT_PARAMS
  const salt = options?.salt ?? randomSalt()
  if (salt.length !== SALT_SIZE) {
    throw new WireFormatError(`salt must be ${SALT_SIZE} bytes, got ${salt.length}`)
  }

  const key = await deriveKey(passphrase, salt, params)
  const paramsBytes = encodeParamsJson(params)
  if (paramsBytes.length > 0xffff) {
    throw new WireFormatError(`params_json too large: ${paramsBytes.length} bytes`)
  }

  const aad = associatedData(WRAPPED_V1, salt, paramsBytes)
  const sealed = await aesEncrypt(pemBytes, key, { associatedData: aad })
  const inner = pack(sealed)

  const out = new Uint8Array(HEADER_FIXED + paramsBytes.length + inner.length)
  let offset = 0
  out[offset++] = WRAPPED_V1
  out.set(salt, offset)
  offset += SALT_SIZE
  // params_len as uint16 big-endian
  out[offset++] = (paramsBytes.length >> 8) & 0xff
  out[offset++] = paramsBytes.length & 0xff
  out.set(paramsBytes, offset)
  offset += paramsBytes.length
  out.set(inner, offset)
  return out
}

/**
 * Decrypt a blob produced by {@link wrapPrivateKey}.
 *
 * Throws {@link WireFormatError} for structural problems and
 * {@link DecryptError} (re-thrown from {@link aesDecrypt}) for crypto
 * failures (wrong passphrase, tampered bytes).
 */
export async function unwrapPrivateKey(
  blob: Uint8Array,
  passphrase: Uint8Array | string,
): Promise<Uint8Array> {
  if (blob.length < HEADER_FIXED) {
    throw new WireFormatError(`blob too short: ${blob.length} < ${HEADER_FIXED}`)
  }
  const version = blob[0]
  if (version !== WRAPPED_V1) {
    throw new WireFormatError(
      `unknown wrapped-key version: 0x${version.toString(16).padStart(2, '0')}`,
    )
  }
  const salt = blob.slice(1, 1 + SALT_SIZE)
  const paramsLen = (blob[1 + SALT_SIZE] << 8) | blob[1 + SALT_SIZE + 1]
  const paramsEnd = HEADER_FIXED + paramsLen
  if (paramsEnd > blob.length) {
    throw new WireFormatError(
      `truncated params field: needed ${paramsEnd} bytes, got ${blob.length}`,
    )
  }
  const paramsBytes = blob.slice(HEADER_FIXED, paramsEnd)
  const inner = blob.slice(paramsEnd)

  let paramsDict: unknown
  try {
    paramsDict = JSON.parse(new TextDecoder().decode(paramsBytes))
  } catch (cause) {
    throw new WireFormatError(`malformed params JSON: ${(cause as Error).message}`, { cause })
  }
  if (typeof paramsDict !== 'object' || paramsDict === null) {
    throw new WireFormatError('params JSON must be an object')
  }
  const params = paramsFromDict(paramsDict as Record<string, unknown>)
  const sealed = unpack(inner)

  const key = await deriveKey(passphrase, salt, params)
  const aad = associatedData(version, salt, paramsBytes)
  return aesDecrypt(sealed, key, { associatedData: aad })
}

/** Cheap sniff: does `blob` start with a known wrapped-key version byte? */
export function isWrappedBlob(blob: Uint8Array): boolean {
  return blob.length >= 1 && blob[0] === WRAPPED_V1
}

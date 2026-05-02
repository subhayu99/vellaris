/**
 * Browser-side WebAuthn ceremony helpers.
 *
 * The Vellaris server hands the client a JSON-encoded
 * `PublicKeyCredentialCreationOptions` (registration) or
 * `PublicKeyCredentialRequestOptions` (authentication). Browsers expect
 * those structs with byte fields as ArrayBuffers, and they return a
 * `PublicKeyCredential` whose nested fields are also ArrayBuffers — but
 * the server expects JSON with base64url-encoded byte fields. This
 * module bridges those two worlds:
 *
 *   - {@link decodePublicKeyCredentialCreationOptions} / `Request`:
 *     takes the server JSON, decodes byte fields, returns the dict
 *     `navigator.credentials.create() / get()` accepts as `publicKey`.
 *
 *   - {@link encodeRegistrationResponse} / `Authentication`: takes the
 *     `PublicKeyCredential` returned by the browser and JSON-stringifies
 *     it with byte fields re-encoded as base64url, the format
 *     `py_webauthn` expects.
 *
 * Also surfaces the PRF extension result — a 32-byte secret derived by
 * the authenticator, used by the SPA to wrap/unwrap the user's RSA-4096
 * private key without ever sending the secret to the server.
 */

/* ---------- base64url helpers ----------
 * The browser-side byte fields use base64url-without-padding per
 * WebAuthn convention. Native btoa/atob handle base64-with-padding;
 * we translate around the difference here. */

function base64urlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const normalized = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const bin = atob(padded)
  // Allocate a fresh ArrayBuffer (not ArrayBufferLike) so the result is
  // assignable wherever BufferSource is expected (WebAuthn dom typings
  // require ArrayBuffer-backed views, not SharedArrayBuffer-backed).
  const buf = new ArrayBuffer(bin.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/* ---------- decoders: server JSON → CredentialCreationOptions ---------- */

interface RawAllowCredential {
  type: string
  id: string
  transports?: string[]
}

interface RawCreationOptions {
  rp: { id: string; name: string }
  user: { id: string; name: string; displayName: string }
  challenge: string
  pubKeyCredParams: Array<{ type: string; alg: number }>
  timeout?: number
  excludeCredentials?: RawAllowCredential[]
  authenticatorSelection?: PublicKeyCredentialCreationOptions['authenticatorSelection']
  attestation?: AttestationConveyancePreference
  extensions?: { prf?: { eval?: { first?: string; second?: string } } }
}

interface RawRequestOptions {
  challenge: string
  timeout?: number
  rpId?: string
  allowCredentials?: RawAllowCredential[]
  userVerification?: UserVerificationRequirement
  extensions?: { prf?: { eval?: { first?: string; second?: string } } }
}

function decodeAllowCredential(raw: RawAllowCredential): PublicKeyCredentialDescriptor {
  return {
    type: raw.type as PublicKeyCredentialType,
    id: base64urlToBytes(raw.id),
    transports: raw.transports as AuthenticatorTransport[] | undefined,
  }
}

function decodeExtensions(
  raw: { prf?: { eval?: { first?: string; second?: string } } } | undefined,
): AuthenticationExtensionsClientInputs | undefined {
  if (!raw?.prf?.eval) return undefined
  const evalInput: { first?: ArrayBuffer; second?: ArrayBuffer } = {}
  if (raw.prf.eval.first) evalInput.first = base64urlToBytes(raw.prf.eval.first).buffer
  if (raw.prf.eval.second) evalInput.second = base64urlToBytes(raw.prf.eval.second).buffer
  // The PRF extension type isn't part of the standard lib.dom.d.ts yet in
  // every TS target; cast through `unknown` once at this boundary instead
  // of polluting every call site with `any`.
  return { prf: { eval: evalInput } } as unknown as AuthenticationExtensionsClientInputs
}

export function decodeCreationOptionsJson(
  optionsJson: string,
): PublicKeyCredentialCreationOptions {
  const raw = JSON.parse(optionsJson) as RawCreationOptions
  return {
    rp: raw.rp,
    user: {
      id: base64urlToBytes(raw.user.id),
      name: raw.user.name,
      displayName: raw.user.displayName,
    },
    challenge: base64urlToBytes(raw.challenge),
    pubKeyCredParams: raw.pubKeyCredParams.map((p) => ({
      type: p.type as PublicKeyCredentialType,
      alg: p.alg,
    })),
    timeout: raw.timeout,
    excludeCredentials: raw.excludeCredentials?.map(decodeAllowCredential),
    authenticatorSelection: raw.authenticatorSelection,
    attestation: raw.attestation,
    extensions: decodeExtensions(raw.extensions),
  }
}

export function decodeRequestOptionsJson(
  optionsJson: string,
): PublicKeyCredentialRequestOptions {
  const raw = JSON.parse(optionsJson) as RawRequestOptions
  return {
    challenge: base64urlToBytes(raw.challenge),
    timeout: raw.timeout,
    rpId: raw.rpId,
    allowCredentials: raw.allowCredentials?.map(decodeAllowCredential),
    userVerification: raw.userVerification,
    extensions: decodeExtensions(raw.extensions),
  }
}

/* ---------- encoders: browser PublicKeyCredential → server JSON ---------- */

export function encodeRegistrationResponse(credential: PublicKeyCredential): string {
  const r = credential.response as AuthenticatorAttestationResponse
  return JSON.stringify({
    id: credential.id,
    rawId: bytesToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bytesToBase64url(r.attestationObject),
      clientDataJSON: bytesToBase64url(r.clientDataJSON),
      transports:
        typeof r.getTransports === 'function' ? r.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? null,
  })
}

export function encodeAuthenticationResponse(credential: PublicKeyCredential): string {
  const r = credential.response as AuthenticatorAssertionResponse
  return JSON.stringify({
    id: credential.id,
    rawId: bytesToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bytesToBase64url(r.authenticatorData),
      clientDataJSON: bytesToBase64url(r.clientDataJSON),
      signature: bytesToBase64url(r.signature),
      userHandle: r.userHandle ? bytesToBase64url(r.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? null,
  })
}

/* ---------- PRF extraction ---------- */

interface PrfFirstResult {
  prf?: { results?: { first?: ArrayBuffer | Uint8Array } }
}

/**
 * Pull the 32-byte PRF output out of `credential.getClientExtensionResults()`.
 * Returns null if the authenticator didn't evaluate PRF (no support, or
 * PRF eval failed). Callers must check the result before trying to wrap
 * keys — fall back to a passphrase-based flow instead of crashing.
 */
export function extractPrfFirst(credential: PublicKeyCredential): Uint8Array | null {
  const results = credential.getClientExtensionResults() as unknown as PrfFirstResult
  const first = results.prf?.results?.first
  if (!first) return null
  if (first instanceof Uint8Array) return first
  return new Uint8Array(first)
}

/* ---------- prerequisite probe ---------- */

/** Quick check: does this browser/OS combo expose WebAuthn at all? */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  )
}

/** True if the platform offers a built-in (e.g. Touch ID / Windows Hello) authenticator. */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

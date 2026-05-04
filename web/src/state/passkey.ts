/**
 * Browser-side glue for the WebAuthn ceremonies.
 *
 * The {@link VellarisClient} provides the network-side step (begin / finish
 * endpoints); this module owns the navigator.credentials calls in between
 * and the PRF-key wrap/unwrap of the user's RSA-4096 PEM. The PRF output
 * never leaves these functions — only the resulting AES-GCM-wrapped blob
 * goes to the server.
 *
 *   register: passphrase-unwrapped PEM → enrollPasskey() → sends wrapped blob
 *   login:    passkey ceremony → server returns wrapped blob → unwrap PEM
 */

import {
  decodeCreationOptionsJson,
  decodeRequestOptionsJson,
  encodeAuthenticationResponse,
  encodeRegistrationResponse,
  extractPrfFirst,
  isWebAuthnSupported,
  type PasskeyAuthFinishResponse,
  type PasskeySummary,
  type VellarisClient,
} from '../api/index.ts'
import { unwrapPrivateKeyWithPrf, wrapPrivateKeyWithPrf } from '../crypto/wrap.ts'

export class PasskeyUnsupportedError extends Error {
  constructor() {
    super("This browser doesn't support passkeys.")
    this.name = 'PasskeyUnsupportedError'
  }
}

export class PrfUnsupportedError extends Error {
  constructor() {
    super(
      "This authenticator doesn't support the PRF extension — passkeys can't decrypt your files. " +
        'Use a passphrase login instead, or register a different authenticator (recent Touch ID, ' +
        'Windows Hello, or 1Password / Bitwarden / iCloud Keychain all support PRF).',
    )
    this.name = 'PrfUnsupportedError'
  }
}

export class PasskeyCancelledError extends Error {
  constructor() {
    super('Passkey prompt was cancelled or timed out.')
    this.name = 'PasskeyCancelledError'
  }
}

function wrap(err: unknown): Error {
  if (err instanceof Error) {
    if (
      err.name === 'NotAllowedError' ||
      err.name === 'AbortError' ||
      err.name === 'TimeoutError'
    ) {
      return new PasskeyCancelledError()
    }
    return err
  }
  return new Error(String(err))
}

/**
 * Register a new passkey for the currently logged-in user.
 *
 * Caller must hand in their unwrapped PEM (from the passphrase login flow).
 * We call create() with PRF eval, derive the 32-byte secret, AES-GCM-wrap
 * the PEM under it, and POST the wrapped blob alongside the credential
 * to the server. Returns the {@link PasskeySummary} as it'll appear in
 * the user's Settings list.
 */
export async function enrollPasskey(
  client: VellarisClient,
  options: { name: string; privatePem: Uint8Array },
): Promise<PasskeySummary> {
  if (!isWebAuthnSupported()) throw new PasskeyUnsupportedError()
  const begin = await client.passkeyRegisterBegin()
  const publicKeyOptions = decodeCreationOptionsJson(begin.optionsJson)

  let credential: PublicKeyCredential
  try {
    const result = await navigator.credentials.create({ publicKey: publicKeyOptions })
    if (!result || !(result instanceof PublicKeyCredential)) {
      throw new Error('navigator.credentials.create returned an unexpected credential type')
    }
    credential = result
  } catch (err) {
    throw wrap(err)
  }

  const prfFirst = extractPrfFirst(credential)
  if (!prfFirst) throw new PrfUnsupportedError()

  const wrappedKey = await wrapPrivateKeyWithPrf(options.privatePem, prfFirst)
  const credentialJson = encodeRegistrationResponse(credential)
  const transports: string[] = (() => {
    try {
      const r = credential.response as AuthenticatorAttestationResponse
      return typeof r.getTransports === 'function' ? r.getTransports() : []
    } catch {
      return []
    }
  })()

  return client.passkeyRegisterFinish({
    challengeId: begin.challengeId,
    name: options.name,
    credentialJson,
    transports,
    wrappedKey,
  })
}

export interface PasskeyLoginResult {
  /** Server response: token + user + wrapped-key blob. */
  auth: PasskeyAuthFinishResponse
  /** Decrypted PEM bytes of the user's RSA-4096 private key. */
  privatePem: Uint8Array
}

/**
 * Authenticate via passkey.
 *
 * If `username` is given, the server returns its allowCredentials so the
 * browser only prompts the relevant authenticator. Without it, the
 * browser uses any discoverable resident credential available for this
 * RP — true username-less / "passwordless" sign-in.
 *
 * On success returns the session token (already cached on the client)
 * plus the unwrapped RSA private-key PEM the caller should put in the
 * in-memory key cache for document decryption.
 */
export async function loginWithPasskey(
  client: VellarisClient,
  options: { username?: string } = {},
): Promise<PasskeyLoginResult> {
  if (!isWebAuthnSupported()) throw new PasskeyUnsupportedError()
  const begin = await client.passkeyAuthBegin(options.username)
  const publicKeyOptions = decodeRequestOptionsJson(begin.optionsJson)

  let credential: PublicKeyCredential
  try {
    const result = await navigator.credentials.get({ publicKey: publicKeyOptions })
    if (!result || !(result instanceof PublicKeyCredential)) {
      throw new Error('navigator.credentials.get returned an unexpected credential type')
    }
    credential = result
  } catch (err) {
    throw wrap(err)
  }

  const prfFirst = extractPrfFirst(credential)
  if (!prfFirst) throw new PrfUnsupportedError()

  const credentialJson = encodeAuthenticationResponse(credential)
  const auth = await client.passkeyAuthFinish({
    challengeId: begin.challengeId,
    credentialJson,
  })
  const privatePem = await unwrapPrivateKeyWithPrf(auth.wrappedKey, prfFirst)

  return { auth, privatePem }
}

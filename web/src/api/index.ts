/**
 * Vellaris HTTP API client — TS port of `src/vellaris/client/api.py`.
 *
 * Use {@link VellarisClient} to talk to a running Vellaris server. Bytes
 * are encoded as base64 strings on the wire; the client handles the
 * conversion so callers always work with `Uint8Array`.
 */

export { VellarisClient } from './client.ts'
export { VellarisAPIError, VellarisNetworkError } from './errors.ts'
export { base64ToBytes, bytesToBase64 } from './_b64.ts'
export {
  decodeCreationOptionsJson,
  decodeRequestOptionsJson,
  encodeAuthenticationResponse,
  encodeRegistrationResponse,
  extractPrfFirst,
  isPlatformAuthenticatorAvailable,
  isWebAuthnSupported,
} from './webauthn.ts'
export type {
  AccessGrant,
  ChallengeResponse,
  DocumentDownload,
  DocumentScope,
  DocumentSummary,
  KeyBlobResponse,
  PasskeyAuthFinishResponse,
  PasskeyBeginResponse,
  PasskeySummary,
  TokenResponse,
  UserPrivate,
  UserPublic,
} from './types.ts'

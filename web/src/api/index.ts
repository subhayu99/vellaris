/**
 * Vellaris HTTP API client — TS port of `src/vellaris/client/api.py`.
 *
 * Use {@link VellarisClient} to talk to a running Vellaris server. Bytes
 * are encoded as base64 strings on the wire; the client handles the
 * conversion so callers always work with `Uint8Array`.
 */

export { VellarisClient } from './client.ts'
export { VellarisAPIError, VellarisNetworkError } from './errors.ts'
export type {
  AccessGrant,
  ChallengeResponse,
  DocumentDownload,
  DocumentScope,
  DocumentSummary,
  KeyBlobResponse,
  TokenResponse,
  UserPrivate,
  UserPublic,
} from './types.ts'

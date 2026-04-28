/**
 * Wire types mirroring `src/vellaris/server/schemas.py`.
 *
 * On the wire, byte fields are base64 strings and datetimes are ISO 8601
 * strings. The client decodes them to `Uint8Array` and `Date` at the
 * boundary so callers don't have to repeat the dance.
 */

/** Self-view of a user. Includes email. */
export interface UserPrivate {
  id: string
  username: string
  email: string
  publicKey: Uint8Array
  createdAt: Date
}

/** Other-user view. No email. */
export interface UserPublic {
  id: string
  username: string
  publicKey: Uint8Array
}

export interface ChallengeResponse {
  challengeId: string
  nonce: Uint8Array
  expiresAt: Date
}

export interface TokenResponse {
  token: string
  expiresAt: Date
  user: UserPrivate
}

export interface AccessGrant {
  userId: string
  encryptedDek: Uint8Array
}

export interface DocumentSummary {
  id: string
  ownerId: string
  ciphertextSize: number
  contentHash: string
  encryptedFilename: Uint8Array
  createdAt: Date
}

export interface DocumentDownload {
  id: string
  ownerId: string
  encryptedFilename: Uint8Array
  encryptedDek: Uint8Array
  ciphertext: Uint8Array
  contentHash: string
}

export interface KeyBlobResponse {
  userId: string
  wrappedKey: Uint8Array
  updatedAt: Date
}

/** Scope filter for `GET /documents`. */
export type DocumentScope = 'mine' | 'shared' | 'all'

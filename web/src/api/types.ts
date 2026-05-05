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

/**
 * One row of a document's access list. Returned only to the document's
 * owner — the server omits the field for non-owners so they can't
 * enumerate co-recipients.
 */
export interface GrantSummary {
  userId: string
  username: string
}

export interface DocumentDownload {
  id: string
  ownerId: string
  encryptedFilename: Uint8Array
  encryptedDek: Uint8Array
  ciphertext: Uint8Array
  contentHash: string
  /** Owner-only. `null` for non-owners. */
  access: GrantSummary[] | null
}

export interface KeyBlobResponse {
  userId: string
  wrappedKey: Uint8Array
  updatedAt: Date
}

/** Scope filter for `GET /documents`. */
export type DocumentScope = 'mine' | 'shared' | 'all'

/* ---------- WebAuthn / passkeys ---------- */

/** Pair returned by either ceremony's "begin" endpoint.
 *
 * `optionsJson` is the server's serialized PublicKeyCredentialCreation /
 * RequestOptions ready to be parsed and fed to navigator.credentials.
 * The challenge_id is server-side state we hand back to "finish".
 */
export interface PasskeyBeginResponse {
  challengeId: string
  optionsJson: string
}

/** A registered passkey as listed in /webauthn/credentials. */
export interface PasskeySummary {
  id: string
  name: string
  transports: string[]
  createdAt: Date
  lastUsedAt: Date | null
}

/** /webauthn/auth/finish response — same as login + a wrapped-key blob. */
export interface PasskeyAuthFinishResponse extends TokenResponse {
  wrappedKey: Uint8Array
}

/* ---------- push notifications ---------- */

/** GET /notifications/public-key — VAPID server public key + subject claim. */
export interface PushVapidKeyResponse {
  publicKey: string
  subject: string
}

/** Body for POST /notifications/subscriptions. */
export interface PushSubscriptionCreate {
  endpoint: string
  p256dhKey: Uint8Array
  authSecret: Uint8Array
  userAgent: string | null
  friendlyName: string | null
}

/** Response from POST /notifications/subscriptions. */
export interface PushSubscriptionRecord {
  id: string
  endpoint: string
  friendlyName: string | null
  userAgent: string | null
  createdAt: Date
}

/** Row from GET /notifications/subscriptions — Settings list. */
export interface PushSubscriptionListItem {
  id: string
  friendlyName: string | null
  userAgent: string | null
  createdAt: Date
  lastUsedAt: Date | null
}

/**
 * Vellaris HTTP API client.
 *
 * Mirrors `src/vellaris/client/api.py` (the Python `VellarisAsyncClient`).
 * Uses native `fetch`. Bytes are base64 on the wire; the client encodes
 * outbound and decodes inbound so callers always work with `Uint8Array`.
 *
 * One client owns one (server URL, bearer token) pair. After a successful
 * `verify()` the token is cached on the instance and sent as
 * `Authorization: Bearer <token>` for every subsequent call that needs auth.
 * `logout()` clears it. `setToken(null)` does too.
 */

import { base64ToBytes, bytesToBase64 } from './_b64.ts'
import { VellarisAPIError, VellarisNetworkError } from './errors.ts'
import type {
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

interface FetchInit {
  method: string
  body?: unknown
  expectStatus?: number | readonly number[]
  requireAuth?: boolean
}

type FetchLike = typeof globalThis.fetch

export interface VellarisClientOptions {
  /** Override the global `fetch` — useful for tests and Node SSR. */
  fetch?: FetchLike
  /** Optional pre-authenticated bearer token. */
  token?: string
}

export class VellarisClient {
  readonly serverUrl: string
  private readonly _fetch: FetchLike
  private _token: string | null

  constructor(serverUrl: string, options: VellarisClientOptions = {}) {
    this.serverUrl = serverUrl.replace(/\/+$/, '')
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this._token = options.token ?? null
  }

  // ---------- token state ----------

  get token(): string | null {
    return this._token
  }

  setToken(token: string | null): void {
    this._token = token
  }

  // ---------- internal helpers ----------

  private async _request(path: string, init: FetchInit): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (init.requireAuth) {
      if (this._token === null) {
        throw new VellarisAPIError(401, 'no bearer token cached on this client')
      }
      headers.Authorization = `Bearer ${this._token}`
    }
    let body: BodyInit | undefined
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(init.body)
    }
    const url = `${this.serverUrl}${path}`
    let response: Response
    try {
      response = await this._fetch(url, { method: init.method, headers, body })
    } catch (cause) {
      throw new VellarisNetworkError(
        `network error talking to ${this.serverUrl}: ${(cause as Error).message}`,
        { cause },
      )
    }
    const expected = init.expectStatus ?? 200
    const ok = Array.isArray(expected)
      ? expected.includes(response.status)
      : response.status === expected
    if (!ok) {
      let detail: string
      try {
        const body = await response.json()
        detail = typeof body?.detail === 'string' ? body.detail : await response.text()
      } catch {
        detail = await response.text().catch(() => '')
      }
      throw new VellarisAPIError(response.status, detail || response.statusText)
    }
    return response
  }

  // ---------- meta ----------

  /** GET /health — connectivity probe used by the server-connect screen. */
  async health(): Promise<{ status: string }> {
    const r = await this._request('/health', { method: 'GET' })
    return r.json() as Promise<{ status: string }>
  }

  // ---------- auth ----------

  async signup(input: {
    username: string
    email: string
    publicKey: Uint8Array
  }): Promise<UserPrivate> {
    const r = await this._request('/users', {
      method: 'POST',
      expectStatus: 201,
      body: {
        username: input.username,
        email: input.email,
        public_key: bytesToBase64(input.publicKey),
      },
    })
    return parseUserPrivate(await r.json())
  }

  async challenge(username: string): Promise<ChallengeResponse> {
    const r = await this._request('/auth/challenge', {
      method: 'POST',
      expectStatus: 201,
      body: { username },
    })
    const body = (await r.json()) as Record<string, unknown>
    return {
      challengeId: String(body.challenge_id),
      nonce: base64ToBytes(String(body.nonce)),
      expiresAt: new Date(String(body.expires_at)),
    }
  }

  async verify(input: { challengeId: string; signature: Uint8Array }): Promise<TokenResponse> {
    const r = await this._request('/auth/verify', {
      method: 'POST',
      body: {
        challenge_id: input.challengeId,
        signature: bytesToBase64(input.signature),
      },
    })
    const body = (await r.json()) as Record<string, unknown>
    const token = String(body.token)
    this._token = token
    return {
      token,
      expiresAt: new Date(String(body.expires_at)),
      user: parseUserPrivate(body.user as Record<string, unknown>),
    }
  }

  async logout(): Promise<void> {
    await this._request('/auth/logout', { method: 'POST', expectStatus: 204, requireAuth: true })
    this._token = null
  }

  // ---------- users ----------

  async me(): Promise<UserPrivate> {
    const r = await this._request('/users/me', { method: 'GET', requireAuth: true })
    return parseUserPrivate(await r.json())
  }

  async getUserById(userId: string): Promise<UserPublic> {
    const r = await this._request(`/users/by-id/${encodeURIComponent(userId)}`, {
      method: 'GET',
      requireAuth: true,
    })
    return parseUserPublic(await r.json())
  }

  async getUserByUsername(username: string): Promise<UserPublic> {
    const r = await this._request(`/users/by-username/${encodeURIComponent(username)}`, {
      method: 'GET',
      requireAuth: true,
    })
    return parseUserPublic(await r.json())
  }

  // ---------- documents ----------

  async uploadDocument(input: {
    encryptedFilename: Uint8Array
    contentHash: string
    ciphertext: Uint8Array
    access: readonly AccessGrant[]
  }): Promise<DocumentSummary> {
    const r = await this._request('/documents', {
      method: 'POST',
      expectStatus: 201,
      requireAuth: true,
      body: {
        encrypted_filename: bytesToBase64(input.encryptedFilename),
        content_hash: input.contentHash,
        ciphertext: bytesToBase64(input.ciphertext),
        access: input.access.map((a) => ({
          user_id: a.userId,
          encrypted_dek: bytesToBase64(a.encryptedDek),
        })),
      },
    })
    return parseDocumentSummary(await r.json())
  }

  async listDocuments(scope: DocumentScope = 'all'): Promise<DocumentSummary[]> {
    const r = await this._request(`/documents?scope=${encodeURIComponent(scope)}`, {
      method: 'GET',
      requireAuth: true,
    })
    const body = (await r.json()) as Record<string, unknown>[]
    return body.map(parseDocumentSummary)
  }

  async downloadDocument(documentId: string): Promise<DocumentDownload> {
    const r = await this._request(`/documents/${encodeURIComponent(documentId)}`, {
      method: 'GET',
      requireAuth: true,
    })
    const body = (await r.json()) as Record<string, unknown>
    const rawAccess = body.access
    const access = Array.isArray(rawAccess)
      ? (rawAccess as Record<string, unknown>[]).map((g) => ({
          userId: String(g.user_id),
          username: String(g.username),
        }))
      : null
    return {
      id: String(body.id),
      ownerId: String(body.owner_id),
      encryptedFilename: base64ToBytes(String(body.encrypted_filename)),
      encryptedDek: base64ToBytes(String(body.encrypted_dek)),
      ciphertext: base64ToBytes(String(body.ciphertext)),
      contentHash: String(body.content_hash),
      access,
    }
  }

  async share(documentId: string, grant: AccessGrant): Promise<void> {
    await this._request(`/documents/${encodeURIComponent(documentId)}/access`, {
      method: 'POST',
      expectStatus: 204,
      requireAuth: true,
      body: { user_id: grant.userId, encrypted_dek: bytesToBase64(grant.encryptedDek) },
    })
  }

  async revoke(documentId: string, userId: string): Promise<void> {
    await this._request(
      `/documents/${encodeURIComponent(documentId)}/access/${encodeURIComponent(userId)}`,
      { method: 'DELETE', expectStatus: 204, requireAuth: true },
    )
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this._request(`/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
      expectStatus: 204,
      requireAuth: true,
    })
  }

  // ---------- key blobs (opt-in sync) ----------

  async pushKeyblob(wrappedKey: Uint8Array): Promise<void> {
    await this._request('/key-blobs/me', {
      method: 'PUT',
      requireAuth: true,
      body: { wrapped_key: bytesToBase64(wrappedKey) },
    })
  }

  async pullKeyblob(): Promise<Uint8Array> {
    const r = await this._request('/key-blobs/me', { method: 'GET', requireAuth: true })
    const body = (await r.json()) as Record<string, unknown>
    return base64ToBytes(String(body.wrapped_key))
  }

  /**
   * GET /key-blobs/by-username/{username} — public, unauthenticated.
   *
   * The fresh-device sign-in bootstrap: a user with no synced passkey
   * and no local wrapped key types their username + passphrase, and the
   * SPA pulls the (passphrase-encrypted) blob via this endpoint to seed
   * IndexedDB. The blob is opaque ciphertext to the server. Throws
   * VellarisAPIError(404) when no blob is stored for that username
   * (covering both "user doesn't exist" and "user exists but never
   * pushed").
   */
  async pullKeyblobByUsername(username: string): Promise<Uint8Array> {
    const r = await this._request(`/key-blobs/by-username/${encodeURIComponent(username)}`, {
      method: 'GET',
    })
    const body = (await r.json()) as Record<string, unknown>
    return base64ToBytes(String(body.wrapped_key))
  }

  async getKeyblobMeta(): Promise<KeyBlobResponse> {
    const r = await this._request('/key-blobs/me', { method: 'GET', requireAuth: true })
    const body = (await r.json()) as Record<string, unknown>
    return {
      userId: String(body.user_id),
      wrappedKey: base64ToBytes(String(body.wrapped_key)),
      updatedAt: new Date(String(body.updated_at)),
    }
  }

  async deleteKeyblob(): Promise<void> {
    await this._request('/key-blobs/me', {
      method: 'DELETE',
      expectStatus: 204,
      requireAuth: true,
    })
  }

  // ---------- passkeys (WebAuthn) ----------

  /** POST /webauthn/register/begin — authenticated; gets a challenge + options. */
  async passkeyRegisterBegin(): Promise<PasskeyBeginResponse> {
    const r = await this._request('/webauthn/register/begin', {
      method: 'POST',
      expectStatus: 201,
      requireAuth: true,
    })
    const body = (await r.json()) as Record<string, unknown>
    return {
      challengeId: String(body.challenge_id),
      optionsJson: String(body.options_json),
    }
  }

  /** POST /webauthn/register/finish — submits the credential + wrapped-key blob. */
  async passkeyRegisterFinish(input: {
    challengeId: string
    name: string
    credentialJson: string
    transports: string[]
    wrappedKey: Uint8Array
  }): Promise<PasskeySummary> {
    const r = await this._request('/webauthn/register/finish', {
      method: 'POST',
      expectStatus: 201,
      requireAuth: true,
      body: {
        challenge_id: input.challengeId,
        name: input.name,
        credential_json: input.credentialJson,
        transports: input.transports,
        wrapped_key: bytesToBase64(input.wrappedKey),
      },
    })
    const body = (await r.json()) as Record<string, unknown>
    return parsePasskeySummary(body)
  }

  /** GET /webauthn/credentials — list the caller's registered passkeys. */
  async listPasskeys(): Promise<PasskeySummary[]> {
    const r = await this._request('/webauthn/credentials', {
      method: 'GET',
      requireAuth: true,
    })
    const arr = (await r.json()) as Array<Record<string, unknown>>
    return arr.map(parsePasskeySummary)
  }

  /** DELETE /webauthn/credentials/:id — remove a registered passkey. */
  async deletePasskey(id: string): Promise<void> {
    await this._request(`/webauthn/credentials/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      expectStatus: 204,
      requireAuth: true,
    })
  }

  /** POST /webauthn/auth/begin — anonymous; optional username for allowCredentials. */
  async passkeyAuthBegin(username?: string): Promise<PasskeyBeginResponse> {
    const r = await this._request('/webauthn/auth/begin', {
      method: 'POST',
      expectStatus: 201,
      body: { username: username ?? null },
    })
    const body = (await r.json()) as Record<string, unknown>
    return {
      challengeId: String(body.challenge_id),
      optionsJson: String(body.options_json),
    }
  }

  /** POST /webauthn/auth/finish — server returns session token + wrapped-key blob. */
  async passkeyAuthFinish(input: {
    challengeId: string
    credentialJson: string
  }): Promise<PasskeyAuthFinishResponse> {
    const r = await this._request('/webauthn/auth/finish', {
      method: 'POST',
      body: {
        challenge_id: input.challengeId,
        credential_json: input.credentialJson,
      },
    })
    const body = (await r.json()) as Record<string, unknown>
    const token = String(body.token)
    this._token = token
    return {
      token,
      expiresAt: new Date(String(body.expires_at)),
      user: parseUserPrivate(body.user as Record<string, unknown>),
      wrappedKey: base64ToBytes(String(body.wrapped_key)),
    }
  }
}

// ---------- field decoders ----------

function parseUserPrivate(body: Record<string, unknown>): UserPrivate {
  return {
    id: String(body.id),
    username: String(body.username),
    email: String(body.email),
    publicKey: base64ToBytes(String(body.public_key)),
    createdAt: new Date(String(body.created_at)),
  }
}

function parseUserPublic(body: Record<string, unknown>): UserPublic {
  return {
    id: String(body.id),
    username: String(body.username),
    publicKey: base64ToBytes(String(body.public_key)),
  }
}

function parseDocumentSummary(body: Record<string, unknown>): DocumentSummary {
  return {
    id: String(body.id),
    ownerId: String(body.owner_id),
    ciphertextSize: Number(body.ciphertext_size),
    contentHash: String(body.content_hash),
    encryptedFilename: base64ToBytes(String(body.encrypted_filename)),
    createdAt: new Date(String(body.created_at)),
  }
}

function parsePasskeySummary(body: Record<string, unknown>): PasskeySummary {
  return {
    id: String(body.id),
    name: String(body.name),
    transports: Array.isArray(body.transports) ? (body.transports as string[]) : [],
    createdAt: new Date(String(body.created_at)),
    lastUsedAt: body.last_used_at ? new Date(String(body.last_used_at)) : null,
  }
}

import { describe, it, expect, vi } from 'vitest'
import { VellarisClient } from './client.ts'
import { VellarisAPIError, VellarisNetworkError } from './errors.ts'
import { bytesToBase64 } from './_b64.ts'

interface Captured {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

function makeFetch(responder: (req: Captured) => Response | Promise<Response>): {
  fetchFn: typeof fetch
  calls: Captured[]
} {
  const calls: Captured[] = []
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k] = v
      }
    }
    const captured: Captured = {
      url: typeof input === 'string' ? input : input.toString(),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }
    calls.push(captured)
    return responder(captured)
  })
  return { fetchFn: fetchFn as unknown as typeof fetch, calls }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const ISO = '2026-04-28T20:00:00Z'

describe('VellarisClient', () => {
  it('strips trailing slashes from the server URL', () => {
    const client = new VellarisClient('http://localhost:8000///')
    expect(client.serverUrl).toBe('http://localhost:8000')
  })

  it('GET /health returns the parsed body', async () => {
    const { fetchFn, calls } = makeFetch(() => jsonResponse(200, { status: 'ok' }))
    const client = new VellarisClient('http://x', { fetch: fetchFn })
    expect(await client.health()).toEqual({ status: 'ok' })
    expect(calls[0].url).toBe('http://x/health')
    expect(calls[0].method).toBe('GET')
  })

  it('POST /users base64-encodes public_key and decodes the response', async () => {
    const publicKey = new TextEncoder().encode('PUBLIC_KEY_PEM_BYTES')
    const { fetchFn, calls } = makeFetch(() =>
      jsonResponse(201, {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'alice',
        email: 'alice@example.com',
        public_key: bytesToBase64(publicKey),
        created_at: ISO,
      }),
    )
    const client = new VellarisClient('http://x', { fetch: fetchFn })
    const user = await client.signup({
      username: 'alice',
      email: 'alice@example.com',
      publicKey,
    })
    expect(calls[0].body).toMatchObject({
      username: 'alice',
      email: 'alice@example.com',
      public_key: bytesToBase64(publicKey),
    })
    expect(user.username).toBe('alice')
    expect(Array.from(user.publicKey)).toEqual(Array.from(publicKey))
    expect(user.createdAt).toBeInstanceOf(Date)
  })

  it('challenge → verify caches the bearer token', async () => {
    const nonce = new Uint8Array(32).fill(0xab)
    const { fetchFn, calls } = makeFetch((req) => {
      if (req.url.endsWith('/auth/challenge')) {
        return jsonResponse(201, {
          challenge_id: 'challenge-uuid',
          nonce: bytesToBase64(nonce),
          expires_at: ISO,
        })
      }
      return jsonResponse(200, {
        token: 'tok_abc',
        expires_at: ISO,
        user: {
          id: 'uid',
          username: 'alice',
          email: 'alice@example.com',
          public_key: bytesToBase64(new Uint8Array(0)),
          created_at: ISO,
        },
      })
    })
    const client = new VellarisClient('http://x', { fetch: fetchFn })
    const ch = await client.challenge('alice')
    expect(Array.from(ch.nonce)).toEqual(Array.from(nonce))
    expect(ch.expiresAt).toBeInstanceOf(Date)

    const sig = new Uint8Array(512).fill(0xcd)
    const verified = await client.verify({ challengeId: ch.challengeId, signature: sig })
    expect(verified.token).toBe('tok_abc')
    expect(client.token).toBe('tok_abc')
    expect(calls[1].body).toMatchObject({
      challenge_id: 'challenge-uuid',
      signature: bytesToBase64(sig),
    })
  })

  it('attaches Authorization on auth-required calls', async () => {
    const { fetchFn, calls } = makeFetch(() =>
      jsonResponse(200, {
        id: 'uid',
        username: 'alice',
        email: 'alice@example.com',
        public_key: '',
        created_at: ISO,
      }),
    )
    const client = new VellarisClient('http://x', { token: 'tok', fetch: fetchFn })
    await client.me()
    expect(calls[0].headers.Authorization).toBe('Bearer tok')
  })

  it('throws VellarisAPIError 401 without a token when auth is required', async () => {
    const { fetchFn } = makeFetch(() => jsonResponse(200, {}))
    const client = new VellarisClient('http://x', { fetch: fetchFn })
    await expect(client.me()).rejects.toBeInstanceOf(VellarisAPIError)
  })

  it('logout clears the token', async () => {
    const { fetchFn } = makeFetch(() => new Response(null, { status: 204 }))
    const client = new VellarisClient('http://x', { token: 'tok', fetch: fetchFn })
    await client.logout()
    expect(client.token).toBeNull()
  })

  it('decodes document download bytes', async () => {
    const ciphertext = new Uint8Array([0x01, 0x02, 0x03])
    const dek = new Uint8Array([0x10, 0x20])
    const filename = new Uint8Array([0xff])
    const { fetchFn } = makeFetch(() =>
      jsonResponse(200, {
        id: 'doc-1',
        owner_id: 'user-1',
        encrypted_filename: bytesToBase64(filename),
        encrypted_dek: bytesToBase64(dek),
        ciphertext: bytesToBase64(ciphertext),
        content_hash: 'sha256:abc',
      }),
    )
    const client = new VellarisClient('http://x', { token: 't', fetch: fetchFn })
    const doc = await client.downloadDocument('doc-1')
    expect(Array.from(doc.ciphertext)).toEqual(Array.from(ciphertext))
    expect(Array.from(doc.encryptedDek)).toEqual(Array.from(dek))
    expect(Array.from(doc.encryptedFilename)).toEqual(Array.from(filename))
    expect(doc.contentHash).toBe('sha256:abc')
    expect(doc.access).toBeNull()
  })

  it('decodes the owner-only access list when present', async () => {
    const { fetchFn } = makeFetch(() =>
      jsonResponse(200, {
        id: 'doc-1',
        owner_id: 'user-1',
        encrypted_filename: bytesToBase64(new Uint8Array([0])),
        encrypted_dek: bytesToBase64(new Uint8Array([0])),
        ciphertext: bytesToBase64(new Uint8Array([0])),
        content_hash: 'sha256:x',
        access: [
          { user_id: 'user-1', username: 'alice' },
          { user_id: 'user-2', username: 'bob' },
        ],
      }),
    )
    const client = new VellarisClient('http://x', { token: 't', fetch: fetchFn })
    const doc = await client.downloadDocument('doc-1')
    expect(doc.access).toEqual([
      { userId: 'user-1', username: 'alice' },
      { userId: 'user-2', username: 'bob' },
    ])
  })

  it('upload encodes nested access grants', async () => {
    const ciphertext = new Uint8Array([0x01])
    const filename = new Uint8Array([0x02])
    const dek1 = new Uint8Array([0x10])
    const dek2 = new Uint8Array([0x11])
    const { fetchFn, calls } = makeFetch(() =>
      jsonResponse(201, {
        id: 'd',
        owner_id: 'u',
        ciphertext_size: 1,
        content_hash: 'sha256:x',
        encrypted_filename: bytesToBase64(filename),
        created_at: ISO,
      }),
    )
    const client = new VellarisClient('http://x', { token: 't', fetch: fetchFn })
    await client.uploadDocument({
      encryptedFilename: filename,
      contentHash: 'sha256:x',
      ciphertext,
      access: [
        { userId: 'u1', encryptedDek: dek1 },
        { userId: 'u2', encryptedDek: dek2 },
      ],
    })
    expect(calls[0].body).toMatchObject({
      access: [
        { user_id: 'u1', encrypted_dek: bytesToBase64(dek1) },
        { user_id: 'u2', encrypted_dek: bytesToBase64(dek2) },
      ],
    })
  })

  it('surfaces server detail in VellarisAPIError', async () => {
    const { fetchFn } = makeFetch(() => jsonResponse(409, { detail: 'username already taken' }))
    const client = new VellarisClient('http://x', { fetch: fetchFn })
    await expect(
      client.signup({ username: 'a', email: 'a@a', publicKey: new Uint8Array(0) }),
    ).rejects.toMatchObject({
      status: 409,
      detail: 'username already taken',
    })
  })

  it('listDocuments serializes the scope query parameter', async () => {
    const { fetchFn, calls } = makeFetch(() => jsonResponse(200, []))
    const client = new VellarisClient('http://x', { token: 't', fetch: fetchFn })
    await client.listDocuments('shared')
    expect(calls[0].url).toBe('http://x/documents?scope=shared')
  })

  it('wraps a fetch failure as VellarisNetworkError', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const client = new VellarisClient('http://x', { fetch: fetchFn as unknown as typeof fetch })
    await expect(client.health()).rejects.toBeInstanceOf(VellarisNetworkError)
  })

  it('share posts a base64-encoded grant', async () => {
    const dek = new Uint8Array([0xaa, 0xbb])
    const { fetchFn, calls } = makeFetch(() => new Response(null, { status: 204 }))
    const client = new VellarisClient('http://x', { token: 't', fetch: fetchFn })
    await client.share('doc-1', { userId: 'u-2', encryptedDek: dek })
    expect(calls[0].url).toBe('http://x/documents/doc-1/access')
    expect(calls[0].body).toMatchObject({ user_id: 'u-2', encrypted_dek: bytesToBase64(dek) })
  })

  it('pullKeyblob returns wrapped bytes', async () => {
    const wrapped = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    const { fetchFn } = makeFetch(() =>
      jsonResponse(200, {
        user_id: 'uid',
        wrapped_key: bytesToBase64(wrapped),
        updated_at: ISO,
      }),
    )
    const client = new VellarisClient('http://x', { token: 't', fetch: fetchFn })
    expect(Array.from(await client.pullKeyblob())).toEqual(Array.from(wrapped))
  })
})

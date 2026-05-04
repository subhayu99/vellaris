/**
 * Tests for the JSON ↔ ArrayBuffer encoders that bridge the Vellaris
 * server's wire format and the browser's WebAuthn API.
 *
 * We can't drive a real authenticator from vitest, but we can stand up
 * fake `PublicKeyCredential`-shaped objects (close enough — the encoder
 * touches only the fields it reads) and round-trip them through the
 * encode helpers, plus exercise the byte-decoding of options JSON the
 * server emits.
 */

import { describe, expect, it } from 'vitest'

import {
  decodeCreationOptionsJson,
  decodeRequestOptionsJson,
  encodeAuthenticationResponse,
  encodeRegistrationResponse,
  extractPrfFirst,
  isWebAuthnSupported,
} from './webauthn.ts'

function bytesToBase64url(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function asBuffer(b: Uint8Array): ArrayBuffer {
  // Slice ensures a fresh ArrayBuffer (not the parent Uint8Array's view).
  return b.slice().buffer
}

describe('decodeCreationOptionsJson', () => {
  it('decodes the byte fields server-side base64url-encodes', () => {
    const challenge = new Uint8Array([1, 2, 3, 4, 5])
    const userId = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const excludeId = new Uint8Array([0x42])
    const prfFirst = new Uint8Array(32).fill(0x9a)
    const json = JSON.stringify({
      rp: { id: 'example.com', name: 'Example' },
      user: {
        id: bytesToBase64url(userId),
        name: 'alice',
        displayName: 'Alice',
      },
      challenge: bytesToBase64url(challenge),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: [
        { type: 'public-key', id: bytesToBase64url(excludeId), transports: ['internal'] },
      ],
      extensions: { prf: { eval: { first: bytesToBase64url(prfFirst) } } },
    })

    const out = decodeCreationOptionsJson(json)
    expect(new Uint8Array(out.challenge as ArrayBuffer)).toEqual(challenge)
    expect(new Uint8Array(out.user.id as ArrayBuffer)).toEqual(userId)
    expect(out.excludeCredentials).toBeDefined()
    expect(out.excludeCredentials![0].transports).toEqual(['internal'])
    // PRF extension survives the trip.
    const ext = out.extensions as unknown as {
      prf: { eval: { first: ArrayBuffer } }
    }
    expect(new Uint8Array(ext.prf.eval.first)).toEqual(prfFirst)
  })

  it('handles missing optional fields without crashing', () => {
    const json = JSON.stringify({
      rp: { id: 'rp', name: 'rp' },
      user: { id: bytesToBase64url(new Uint8Array([0])), name: 'a', displayName: 'a' },
      challenge: bytesToBase64url(new Uint8Array([0])),
      pubKeyCredParams: [],
    })
    const out = decodeCreationOptionsJson(json)
    expect(out.excludeCredentials).toBeUndefined()
    expect(out.extensions).toBeUndefined()
  })
})

describe('decodeRequestOptionsJson', () => {
  it('decodes auth options and allowCredentials', () => {
    const challenge = new Uint8Array([7, 7, 7])
    const credId = new Uint8Array([0xab, 0xcd])
    const json = JSON.stringify({
      challenge: bytesToBase64url(challenge),
      rpId: 'example.com',
      allowCredentials: [
        { type: 'public-key', id: bytesToBase64url(credId), transports: ['hybrid'] },
      ],
      userVerification: 'preferred',
      extensions: {
        prf: { eval: { first: bytesToBase64url(new Uint8Array(32).fill(0x11)) } },
      },
    })
    const out = decodeRequestOptionsJson(json)
    expect(out.rpId).toBe('example.com')
    expect(new Uint8Array(out.challenge as ArrayBuffer)).toEqual(challenge)
    expect(out.allowCredentials).toHaveLength(1)
    expect(new Uint8Array(out.allowCredentials![0].id as ArrayBuffer)).toEqual(credId)
  })
})

describe('encodeRegistrationResponse', () => {
  it('serializes attestation byte fields as base64url', () => {
    const rawId = new Uint8Array([1, 2, 3])
    const attestation = new Uint8Array([10, 20, 30])
    const clientData = new Uint8Array([100, 110])
    const fakeCredential = {
      id: 'fake-id-string',
      rawId: asBuffer(rawId),
      type: 'public-key',
      response: {
        attestationObject: asBuffer(attestation),
        clientDataJSON: asBuffer(clientData),
        getTransports: () => ['internal', 'hybrid'],
      },
      getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(32).buffer } } }),
      authenticatorAttachment: 'platform',
    } as unknown as PublicKeyCredential

    const wire = encodeRegistrationResponse(fakeCredential)
    const parsed = JSON.parse(wire)
    expect(parsed.id).toBe('fake-id-string')
    expect(parsed.rawId).toBe(bytesToBase64url(rawId))
    expect(parsed.response.attestationObject).toBe(bytesToBase64url(attestation))
    expect(parsed.response.clientDataJSON).toBe(bytesToBase64url(clientData))
    expect(parsed.response.transports).toEqual(['internal', 'hybrid'])
  })
})

describe('encodeAuthenticationResponse', () => {
  it('serializes assertion byte fields as base64url', () => {
    const rawId = new Uint8Array([5, 6])
    const authData = new Uint8Array([0xa1, 0xa2])
    const clientData = new Uint8Array([0xc1])
    const signature = new Uint8Array([0xff, 0xee])
    const userHandle = new Uint8Array([0x01])
    const fakeCredential = {
      id: 'fake',
      rawId: asBuffer(rawId),
      type: 'public-key',
      response: {
        authenticatorData: asBuffer(authData),
        clientDataJSON: asBuffer(clientData),
        signature: asBuffer(signature),
        userHandle: asBuffer(userHandle),
      },
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential

    const wire = encodeAuthenticationResponse(fakeCredential)
    const parsed = JSON.parse(wire)
    expect(parsed.response.authenticatorData).toBe(bytesToBase64url(authData))
    expect(parsed.response.signature).toBe(bytesToBase64url(signature))
    expect(parsed.response.userHandle).toBe(bytesToBase64url(userHandle))
  })

  it('emits null userHandle when absent', () => {
    const fakeCredential = {
      id: 'x',
      rawId: asBuffer(new Uint8Array([1])),
      type: 'public-key',
      response: {
        authenticatorData: asBuffer(new Uint8Array([2])),
        clientDataJSON: asBuffer(new Uint8Array([3])),
        signature: asBuffer(new Uint8Array([4])),
        userHandle: null,
      },
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential
    const parsed = JSON.parse(encodeAuthenticationResponse(fakeCredential))
    expect(parsed.response.userHandle).toBeNull()
  })
})

describe('extractPrfFirst', () => {
  it('returns the PRF first secret as a Uint8Array', () => {
    const secret = new Uint8Array(32).fill(0x77)
    const fakeCredential = {
      getClientExtensionResults: () => ({
        prf: { results: { first: secret.buffer } },
      }),
    } as unknown as PublicKeyCredential
    const out = extractPrfFirst(fakeCredential)
    expect(out).toEqual(secret)
  })

  it('returns null when PRF was not evaluated', () => {
    const noPrf = {
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential
    expect(extractPrfFirst(noPrf)).toBeNull()
    const malformed = {
      getClientExtensionResults: () => ({ prf: {} }),
    } as unknown as PublicKeyCredential
    expect(extractPrfFirst(malformed)).toBeNull()
  })
})

describe('isWebAuthnSupported', () => {
  it('reports based on the global navigator.credentials presence', () => {
    // jsdom doesn't expose PublicKeyCredential — that's fine for the contract.
    const result = isWebAuthnSupported()
    expect(typeof result).toBe('boolean')
  })
})

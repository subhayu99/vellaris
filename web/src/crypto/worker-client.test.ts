/**
 * Worker-client smoke + round-trip tests.
 *
 * jsdom doesn't ship a Worker constructor, so the worker-client falls
 * back to running every operation in-thread. That fallback is what
 * production-style call sites (signup, login) hit during unit tests, so
 * we exercise it here. The actual Web Worker thread is covered by the
 * underlying crypto modules' own round-trip tests.
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  __resetCryptoWorkerForTests,
  generateOaepKeypair,
  handleWorkerRequest,
  unwrapPrivateKey,
  wrapPrivateKey,
} from './worker-client.ts'

afterEach(() => {
  __resetCryptoWorkerForTests()
})

describe('worker-client', () => {
  it('falls back to in-thread keygen when Worker is unavailable (jsdom)', async () => {
    const { privatePem, publicPem } = await generateOaepKeypair()
    expect(privatePem.byteLength).toBeGreaterThan(0)
    expect(publicPem.byteLength).toBeGreaterThan(0)
    const privText = new TextDecoder().decode(privatePem)
    const pubText = new TextDecoder().decode(publicPem)
    expect(privText).toContain('BEGIN PRIVATE KEY')
    expect(pubText).toContain('BEGIN PUBLIC KEY')
  })

  it('round-trips a PEM through wrap → unwrap with the right passphrase', async () => {
    const { privatePem } = await generateOaepKeypair()
    const wrapped = await wrapPrivateKey(privatePem, 'correct-horse-battery-staple')
    expect(wrapped[0]).toBe(0x01) // WRAPPED_V1 marker — sniff via the wire format
    const unwrapped = await unwrapPrivateKey(wrapped, 'correct-horse-battery-staple')
    expect(Array.from(unwrapped)).toEqual(Array.from(privatePem))
  }, 30_000)

  it('rejects when the passphrase is wrong', async () => {
    const { privatePem } = await generateOaepKeypair()
    const wrapped = await wrapPrivateKey(privatePem, 'right')
    await expect(unwrapPrivateKey(wrapped, 'wrong')).rejects.toThrow()
  }, 30_000)
})

describe('handleWorkerRequest dispatcher', () => {
  // Smoke-test the message handler the worker thread runs. This is the
  // exact code that ships in worker.ts inside `self.addEventListener`.

  it('returns ok=true with serialized PEMs on generateOaepKeypair', async () => {
    const reply = await handleWorkerRequest({ id: 1, type: 'generateOaepKeypair' })
    expect(reply.ok).toBe(true)
    if (!reply.ok) throw new Error('unreachable')
    const result = reply.result as { privatePem: Uint8Array; publicPem: Uint8Array }
    expect(result.privatePem.byteLength).toBeGreaterThan(0)
    expect(result.publicPem.byteLength).toBeGreaterThan(0)
  })

  it('reports errors as ok=false with name + message', async () => {
    const reply = await handleWorkerRequest({
      id: 7,
      type: 'unwrapPrivateKey',
      blob: new Uint8Array([0xff]),
      passphrase: 'irrelevant',
    })
    expect(reply.ok).toBe(false)
    if (reply.ok) throw new Error('unreachable')
    expect(reply.id).toBe(7)
    expect(reply.error.message.length).toBeGreaterThan(0)
  })
})

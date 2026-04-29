/**
 * Main-thread wrapper around the crypto Web Worker.
 *
 * Lazy-instantiates a single worker on first use. If the platform has no
 * `Worker` (jsdom in unit tests, very old browsers, or CSP that blocks
 * workers) we fall back to running the same operations in-thread so
 * callers don't need to special-case the test environment. In production
 * the fast path is the worker — RSA-4096 keygen and Argon2id no longer
 * freeze the main thread.
 *
 * The wrapper exposes a tiny, signup/login-shaped API rather than
 * mirroring every crypto primitive: only the operations that actually
 * dominate wall-clock time (or that produce data we'd otherwise have to
 * marshal CryptoKey objects for) are routed through the worker.
 */

import {
  generateOaepKeypair as _generateOaepKeypair,
  serializePrivateKey,
  serializePublicKey,
} from './asymmetric.ts'
import {
  unwrapPrivateKey as _unwrapPrivateKey,
  wrapPrivateKey as _wrapPrivateKey,
} from './wrap.ts'
import {
  handleWorkerRequest,
  type WorkerKeypairResult,
  type WorkerRequest,
  type WorkerRequestBody,
  type WorkerResponse,
} from './worker.ts'

export type { WorkerKeypairResult }

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

let _worker: Worker | null = null
let _workerProbed = false
let _seq = 0
const _pending = new Map<number, PendingCall>()

function buildWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'vellaris-crypto',
    })
    w.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      const r = e.data
      const handler = _pending.get(r.id)
      if (!handler) return
      _pending.delete(r.id)
      if (r.ok) {
        handler.resolve(r.result)
      } else {
        const err = new Error(r.error.message)
        err.name = r.error.name
        handler.reject(err)
      }
    })
    w.addEventListener('error', (e) => {
      // Reject every pending call so the UI surfaces something useful.
      for (const [id, h] of _pending) {
        _pending.delete(id)
        h.reject(new Error(`crypto worker error: ${e.message || 'unknown'}`))
      }
    })
    return w
  } catch {
    return null
  }
}

function ensureWorker(): Worker | null {
  if (_workerProbed) return _worker
  _workerProbed = true
  _worker = buildWorker()
  return _worker
}

function send<T>(payload: WorkerRequestBody): Promise<T> | null {
  const w = ensureWorker()
  if (!w) return null
  const id = ++_seq
  return new Promise<T>((resolve, reject) => {
    _pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    const message: WorkerRequest = { id, ...payload }
    w.postMessage(message)
  })
}

async function fallbackGenerate(): Promise<WorkerKeypairResult> {
  const pair = await _generateOaepKeypair()
  return {
    privatePem: await serializePrivateKey(pair.privateKey),
    publicPem: await serializePublicKey(pair.publicKey),
  }
}

/**
 * Generate an RSA-4096 OAEP keypair and return both keys serialized to
 * PEM. Heavier than {@link _generateOaepKeypair} because it exports the
 * keys before returning, but that's exactly what every caller wants —
 * `CryptoKey` instances can't cross the worker boundary anyway.
 */
export async function generateOaepKeypair(): Promise<WorkerKeypairResult> {
  const promise = send<WorkerKeypairResult>({ type: 'generateOaepKeypair' })
  return promise ?? fallbackGenerate()
}

export async function wrapPrivateKey(
  pem: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  const promise = send<Uint8Array>({ type: 'wrapPrivateKey', pem, passphrase })
  return promise ?? _wrapPrivateKey(pem, passphrase)
}

export async function unwrapPrivateKey(
  blob: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  const promise = send<Uint8Array>({ type: 'unwrapPrivateKey', blob, passphrase })
  return promise ?? _unwrapPrivateKey(blob, passphrase)
}

/**
 * Test-only: forget the cached worker so the next call re-probes. Useful
 * when stubbing/unstubbing `globalThis.Worker` between cases. Not
 * exported from any package barrel.
 */
export function __resetCryptoWorkerForTests(): void {
  if (_worker) _worker.terminate()
  _worker = null
  _workerProbed = false
  _pending.clear()
  _seq = 0
}

// Re-export the in-thread handler so unit tests can drive the same
// dispatcher without spinning up a real Worker.
export { handleWorkerRequest }

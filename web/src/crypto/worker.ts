/**
 * Web Worker — runs the slow crypto off the main thread.
 *
 * Three operations dominate:
 *   - RSA-4096 keygen (~1-2s on Apple Silicon, multi-second on low-end mobile)
 *   - Argon2id derive at production parameters (~1-2s)
 *   - AES-GCM wrap / unwrap (fast, but bundled with the Argon2 derive)
 *
 * Doing them on the main thread makes the EncryptAnim feel honest but
 * still freezes any other interaction. This worker takes the load.
 *
 * Wire format: a `RequestMessage` in, a `ResponseMessage` out, both with
 * the same `id` so the worker-client can multiplex calls. We never
 * marshal `CryptoKey` across the worker boundary (it isn't structured-
 * cloneable); for keygen we serialize to PEM inside the worker and ship
 * the bytes back.
 */

/// <reference lib="webworker" />

import {
  generateOaepKeypair,
  serializePrivateKey,
  serializePublicKey,
} from './asymmetric.ts'
import { unwrapPrivateKey, wrapPrivateKey } from './wrap.ts'

export type WorkerRequestBody =
  | { type: 'generateOaepKeypair' }
  | { type: 'wrapPrivateKey'; pem: Uint8Array; passphrase: string }
  | { type: 'unwrapPrivateKey'; blob: Uint8Array; passphrase: string }

export type WorkerRequest = WorkerRequestBody & { id: number }

export interface WorkerKeypairResult {
  privatePem: Uint8Array
  publicPem: Uint8Array
}

export type WorkerResponse =
  | { id: number; ok: true; result: WorkerKeypairResult | Uint8Array }
  | { id: number; ok: false; error: { name: string; message: string } }

export async function handleWorkerRequest(req: WorkerRequest): Promise<WorkerResponse> {
  try {
    switch (req.type) {
      case 'generateOaepKeypair': {
        const pair = await generateOaepKeypair()
        const result: WorkerKeypairResult = {
          privatePem: await serializePrivateKey(pair.privateKey),
          publicPem: await serializePublicKey(pair.publicKey),
        }
        return { id: req.id, ok: true, result }
      }
      case 'wrapPrivateKey':
        return { id: req.id, ok: true, result: await wrapPrivateKey(req.pem, req.passphrase) }
      case 'unwrapPrivateKey':
        return { id: req.id, ok: true, result: await unwrapPrivateKey(req.blob, req.passphrase) }
    }
  } catch (err) {
    const e = err as Error
    return {
      id: req.id,
      ok: false,
      error: { name: e.name ?? 'Error', message: e.message ?? String(err) },
    }
  }
}

// Wire the dispatcher to the worker scope. Skipped when imported from the
// main thread (e.g. by the worker-client fallback or unit tests).
declare const self: DedicatedWorkerGlobalScope
if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
    const reply = await handleWorkerRequest(e.data)
    self.postMessage(reply)
  })
}

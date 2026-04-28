/**
 * Internal buffer helper. WebCrypto's `BufferSource` is
 * `ArrayBufferView<ArrayBuffer> | ArrayBuffer` in TS 6, but stock
 * `Uint8Array` widens to `Uint8Array<ArrayBufferLike>` (i.e. potentially
 * `SharedArrayBuffer`-backed). Re-allocate into a fresh ArrayBuffer-backed
 * view at the boundary so the types line up. Cost is one short copy per
 * call; negligible for keys/nonces/AAD and unmeasurable for ciphertexts.
 */

export function bs(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(input.length)
  out.set(input)
  return out
}

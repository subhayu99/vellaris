import { get as idbGet } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bytesToBase64 } from '../api/_b64.ts'
import {
  __resetKeystoreForTests,
  clearWrappedKey,
  getWrappedKey,
  hasWrappedKey,
  loadKeystore,
  setWrappedKey,
} from './keystore.ts'

const STORAGE_KEY = 'vellaris.wrappedKey'

beforeEach(async () => {
  // Each test starts with a clean IDB and an empty keystore cache.
  __resetKeystoreForTests()
  // fake-indexeddb is module-scoped; tear down its connection per test
  // by clearing the value we wrote.
  try {
    const { del } = await import('idb-keyval')
    await del(STORAGE_KEY)
  } catch {
    /* swallow */
  }
})

afterEach(() => {
  __resetKeystoreForTests()
})

describe('keystore', () => {
  // toEqual on Uint8Array crosses realms (fake-indexeddb structured-clones
  // through a different ArrayBuffer realm), which Vitest renders as
  // "no visual difference" but still fails. Compare as plain arrays.
  function bytesEqual(actual: Uint8Array | null | undefined, expected: Uint8Array): void {
    expect(actual).not.toBeNull()
    expect(Array.from(actual!)).toEqual(Array.from(expected))
  }

  it('round-trips a blob through set/get without IDB rehydration', () => {
    const blob = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    expect(getWrappedKey()).toBeNull()
    expect(hasWrappedKey()).toBe(false)

    setWrappedKey(blob)
    bytesEqual(getWrappedKey(), blob)
    expect(hasWrappedKey()).toBe(true)

    clearWrappedKey()
    expect(getWrappedKey()).toBeNull()
    expect(hasWrappedKey()).toBe(false)
  })

  it('persists writes to IDB so a fresh loadKeystore() can rehydrate', async () => {
    const blob = new Uint8Array([0xaa, 0xbb, 0xcc])
    setWrappedKey(blob)

    // Wait one microtask for the fire-and-forget IDB write.
    await Promise.resolve()
    await Promise.resolve()

    bytesEqual((await idbGet(STORAGE_KEY)) as Uint8Array, blob)

    __resetKeystoreForTests()
    expect(getWrappedKey()).toBeNull()

    await loadKeystore()
    bytesEqual(getWrappedKey(), blob)
  })

  it('migrates a legacy localStorage entry to IDB on first loadKeystore', async () => {
    const blob = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    localStorage.setItem(STORAGE_KEY, bytesToBase64(blob))

    await loadKeystore()

    bytesEqual(getWrappedKey(), blob)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    bytesEqual((await idbGet(STORAGE_KEY)) as Uint8Array, blob)
  })

  it('is idempotent across repeated loadKeystore() calls', async () => {
    const blob = new Uint8Array([0x42])
    setWrappedKey(blob)
    await Promise.resolve()
    await Promise.resolve()

    __resetKeystoreForTests()
    await loadKeystore()
    await loadKeystore()
    bytesEqual(getWrappedKey(), blob)
  })

  it('returns null when nothing is stored', async () => {
    await loadKeystore()
    expect(getWrappedKey()).toBeNull()
    expect(hasWrappedKey()).toBe(false)
  })
})

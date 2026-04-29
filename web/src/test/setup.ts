import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { __resetKeystoreForTests } from '../state/keystore.ts'

// Vitest 4 doesn't auto-register testing-library cleanup, so do it here.
afterEach(() => {
  cleanup()
})

/**
 * Node 25 ships an experimental built-in `localStorage` that's broken without
 * --localstorage-file. jsdom 29 also exposes one on `window`. The two clash:
 * code reading `globalThis.localStorage` may hit Node's stub before jsdom's.
 *
 * Install a Map-backed Storage shim on `globalThis` that's reset between tests
 * so behavior is deterministic.
 */
function makeStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeStorage(),
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: makeStorage(),
    configurable: true,
    writable: true,
  })
  __resetKeystoreForTests()
})

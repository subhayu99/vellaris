import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearVellarisCaches } from './sw-cache.ts'

interface FakeController {
  postMessage: ReturnType<typeof vi.fn>
}

describe('clearVellarisCaches', () => {
  let originalServiceWorker: PropertyDescriptor | undefined
  let originalCaches: PropertyDescriptor | undefined

  beforeEach(() => {
    originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
    originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  })

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
    } else {
      delete (navigator as unknown as { serviceWorker?: ServiceWorkerContainer }).serviceWorker
    }
    if (originalCaches) {
      Object.defineProperty(globalThis, 'caches', originalCaches)
    } else {
      delete (globalThis as unknown as { caches?: CacheStorage }).caches
    }
  })

  it('uses postMessage when a SW controls the page', async () => {
    const controller: FakeController = { postMessage: vi.fn() }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller },
    })
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn(),
        delete: vi.fn(),
      },
    })

    await clearVellarisCaches()
    expect(controller.postMessage).toHaveBeenCalledWith({ type: 'CLEAR_VELLARIS_CACHES' })
  })

  it('falls back to caches.delete when no SW controller is registered', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null },
    })
    const deleteFn = vi.fn().mockResolvedValue(true)
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi
          .fn()
          .mockResolvedValue(['vellaris-docs', 'vellaris-users', 'workbox-precache-foo']),
        delete: deleteFn,
      },
    })

    await clearVellarisCaches()
    expect(deleteFn).toHaveBeenCalledTimes(2)
    expect(deleteFn).toHaveBeenCalledWith('vellaris-docs')
    expect(deleteFn).toHaveBeenCalledWith('vellaris-users')
    expect(deleteFn).not.toHaveBeenCalledWith('workbox-precache-foo')
  })

  it('is a no-op when caches API is unavailable', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    })
    delete (globalThis as unknown as { caches?: CacheStorage }).caches
    await expect(clearVellarisCaches()).resolves.toBeUndefined()
  })
})

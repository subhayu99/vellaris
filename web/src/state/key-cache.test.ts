import { afterEach, describe, expect, it, vi } from 'vitest'

// Each test imports a fresh copy of key-cache so the module-level state
// doesn't leak across tests — and so we can simulate "page reload" by
// re-importing after writing to sessionStorage.

afterEach(() => {
  vi.resetModules()
  sessionStorage.clear()
})

describe('key-cache', () => {
  it('round-trips the unwrapped PEM through the in-memory cache', async () => {
    const cache = await import('./key-cache.ts')
    const pem = new TextEncoder().encode(
      '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    )
    expect(cache.hasUnwrappedPem()).toBe(false)
    cache.setUnwrappedPem(pem)
    expect(cache.hasUnwrappedPem()).toBe(true)
    expect(cache.getUnwrappedPem()).toEqual(pem)
  })

  it('survives a simulated page reload (re-import) via sessionStorage', async () => {
    {
      const cache = await import('./key-cache.ts')
      const pem = new TextEncoder().encode('SECRET')
      cache.setUnwrappedPem(pem)
    }
    // Module-level memory is wiped on reload — drop the import cache and
    // re-import. The new module instance should still find the PEM via
    // sessionStorage.
    vi.resetModules()
    {
      const cache = await import('./key-cache.ts')
      expect(cache.hasUnwrappedPem()).toBe(true)
      const got = cache.getUnwrappedPem()
      expect(new TextDecoder().decode(got!)).toBe('SECRET')
    }
  })

  it('clearUnwrappedPem wipes both the in-memory copy and sessionStorage', async () => {
    const cache = await import('./key-cache.ts')
    cache.setUnwrappedPem(new TextEncoder().encode('SECRET'))
    expect(cache.hasUnwrappedPem()).toBe(true)
    cache.clearUnwrappedPem()
    expect(cache.hasUnwrappedPem()).toBe(false)
    expect(sessionStorage.getItem('vellaris.unwrappedPemB64')).toBeNull()
  })

  it('does not leak between tests', async () => {
    // afterEach runs cleanup; this test should start with no PEM.
    const cache = await import('./key-cache.ts')
    expect(cache.hasUnwrappedPem()).toBe(false)
  })
})

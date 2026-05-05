import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  detectPermissionState,
  recordSoftDismissal,
  shouldShowSoftPrompt,
  softDismissalCount,
} from './notifications.ts'

interface FakePushManager {
  getSubscription: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

function withServiceWorker(pushManager: FakePushManager): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
  ;(window as unknown as { PushManager?: object }).PushManager = function () {}
}

function withoutServiceWorker(): void {
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker
  delete (window as unknown as { PushManager?: unknown }).PushManager
}

function setNotification(permission: 'default' | 'granted' | 'denied'): void {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: { permission, requestPermission: vi.fn() },
  })
}

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua })
}

describe('detectPermissionState', () => {
  let originalUserAgent: PropertyDescriptor | undefined

  beforeEach(() => {
    originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
  })

  afterEach(() => {
    if (originalUserAgent) {
      Object.defineProperty(navigator, 'userAgent', originalUserAgent)
    }
    withoutServiceWorker()
    delete (globalThis as unknown as { Notification?: unknown }).Notification
  })

  it("reports 'unsupported' on plain browsers without push", async () => {
    withoutServiceWorker()
    setUserAgent('Mozilla/5.0 Linux Chrome/130')
    expect(await detectPermissionState()).toEqual({ kind: 'unsupported' })
  })

  it("reports 'ios-needs-install' when iOS Safari hasn't been added to home screen", async () => {
    withoutServiceWorker()
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/605')
    expect(await detectPermissionState()).toEqual({ kind: 'ios-needs-install' })
  })

  it("reports 'default' when permission hasn't been decided", async () => {
    withServiceWorker({ getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() })
    setNotification('default')
    expect(await detectPermissionState()).toEqual({ kind: 'default' })
  })

  it("reports 'denied' when the user has blocked at the browser level", async () => {
    withServiceWorker({ getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() })
    setNotification('denied')
    expect(await detectPermissionState()).toEqual({ kind: 'denied' })
  })

  it("reports 'granted-not-subscribed' when permission is granted but no SW subscription exists", async () => {
    withServiceWorker({ getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() })
    setNotification('granted')
    expect(await detectPermissionState()).toEqual({ kind: 'granted-not-subscribed' })
  })

  it("reports 'granted-subscribed' when both flags are green", async () => {
    withServiceWorker({
      getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://x' }),
      subscribe: vi.fn(),
    })
    setNotification('granted')
    expect(await detectPermissionState()).toEqual({ kind: 'granted-subscribed' })
  })
})

describe('soft dismissal counter', () => {
  it('increments per call and surfaces via softDismissalCount()', () => {
    expect(softDismissalCount()).toBe(0)
    recordSoftDismissal()
    recordSoftDismissal()
    expect(softDismissalCount()).toBe(2)
  })

  it('returns 0 on a malformed counter', () => {
    sessionStorage.setItem('vellaris.notifications.soft-dismiss-count', 'not-a-number')
    expect(softDismissalCount()).toBe(0)
  })
})

describe('shouldShowSoftPrompt', () => {
  it('returns true while under the soft limit on default permission', () => {
    expect(shouldShowSoftPrompt({ kind: 'default' })).toBe(true)
  })

  it('returns false on non-default states', () => {
    expect(shouldShowSoftPrompt({ kind: 'granted-subscribed' })).toBe(false)
    expect(shouldShowSoftPrompt({ kind: 'denied' })).toBe(false)
    expect(shouldShowSoftPrompt({ kind: 'unsupported' })).toBe(false)
  })

  it('respects the 7-day cooldown after the limit is hit', () => {
    for (let i = 0; i < 3; i++) recordSoftDismissal()
    // Past the limit + no localStorage timestamp → still allowed (first run).
    localStorage.removeItem('vellaris.notifications.soft-dismiss-at')
    expect(shouldShowSoftPrompt({ kind: 'default' })).toBe(true)

    // With a fresh-ish timestamp the prompt is suppressed.
    localStorage.setItem('vellaris.notifications.soft-dismiss-at', new Date().toISOString())
    expect(shouldShowSoftPrompt({ kind: 'default' })).toBe(false)

    // 8 days ago → cooldown over, prompt re-emerges.
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    localStorage.setItem('vellaris.notifications.soft-dismiss-at', old)
    expect(shouldShowSoftPrompt({ kind: 'default' })).toBe(true)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readPermission, subscribeToPush, unsubscribeFromPush } from './push-subscription.ts'

interface MockSubscription {
  endpoint: string
  unsubscribe: ReturnType<typeof vi.fn>
  getKey: (name: string) => ArrayBuffer
}

interface MockPushManager {
  subscribe: ReturnType<typeof vi.fn>
  getSubscription: ReturnType<typeof vi.fn>
}

function setupServiceWorker(pushManager: MockPushManager): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
  // Window.PushManager presence is the feature-flag check.
  ;(window as unknown as { PushManager?: object }).PushManager = function () {}
}

function teardownServiceWorker(): void {
  delete (navigator as unknown as { serviceWorker?: ServiceWorkerContainer }).serviceWorker
  delete (window as unknown as { PushManager?: object }).PushManager
}

function makeSubscription(): MockSubscription {
  // Two ArrayBuffers we can return from getKey.
  const p256 = new ArrayBuffer(65)
  new Uint8Array(p256).set([0x04, 0x01, 0x02])
  const auth = new ArrayBuffer(16)
  new Uint8Array(auth).set([0xaa, 0xbb])
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getKey: (name: string) => (name === 'p256dh' ? p256 : auth),
  }
}

describe('readPermission', () => {
  it('reports unsupported when PushManager is missing', () => {
    teardownServiceWorker()
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission: vi.fn() },
    })
    const snap = readPermission()
    expect(snap.supported).toBe(false)
  })

  it('reports current Notification.permission', () => {
    setupServiceWorker({
      subscribe: vi.fn(),
      getSubscription: vi.fn().mockResolvedValue(null),
    })
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: { permission: 'granted', requestPermission: vi.fn() },
    })
    const snap = readPermission()
    expect(snap.supported).toBe(true)
    expect(snap.permission).toBe('granted')
  })
})

describe('subscribeToPush', () => {
  let pushManager: MockPushManager
  let mockSubscription: MockSubscription

  beforeEach(() => {
    mockSubscription = makeSubscription()
    pushManager = {
      subscribe: vi.fn().mockResolvedValue(mockSubscription),
      getSubscription: vi.fn().mockResolvedValue(null),
    }
    setupServiceWorker(pushManager)
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: { permission: 'granted', requestPermission: vi.fn() },
    })
  })

  afterEach(() => {
    teardownServiceWorker()
    delete (globalThis as unknown as { Notification?: typeof Notification }).Notification
  })

  it('throws when permission has not been granted', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: { permission: 'denied', requestPermission: vi.fn() },
    })
    const client = makeFakeClient()
    await expect(subscribeToPush(client)).rejects.toThrow(/permission/)
  })

  it('decodes base64url public key + registers on the server', async () => {
    const registerSpy = vi.fn().mockResolvedValue({
      id: 'sub-1',
      endpoint: mockSubscription.endpoint,
      friendlyName: 'iPhone',
      userAgent: 'iPhone Safari',
      createdAt: new Date(),
    })
    const client = makeFakeClient({ register: registerSpy })

    const record = await subscribeToPush(client)
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
    const opts = pushManager.subscribe.mock.calls[0]?.[0] as {
      userVisibleOnly?: boolean
      applicationServerKey?: ArrayBuffer
    }
    expect(opts.userVisibleOnly).toBe(true)
    expect(opts.applicationServerKey?.byteLength).toBeGreaterThan(0)

    expect(registerSpy).toHaveBeenCalledTimes(1)
    const body = registerSpy.mock.calls[0]?.[0] as { endpoint: string }
    expect(body.endpoint).toBe(mockSubscription.endpoint)
    expect(record.id).toBe('sub-1')

    expect(localStorage.getItem('vellaris.push-subscription-id')).toBe('sub-1')
  })

  it('drops a stale local subscription before subscribing fresh', async () => {
    const stale = makeSubscription()
    pushManager.getSubscription = vi.fn().mockResolvedValue(stale)
    const client = makeFakeClient()
    await subscribeToPush(client)
    expect(stale.unsubscribe).toHaveBeenCalled()
    expect(pushManager.subscribe).toHaveBeenCalled()
  })
})

describe('unsubscribeFromPush', () => {
  let pushManager: MockPushManager
  let mockSubscription: MockSubscription

  beforeEach(() => {
    mockSubscription = makeSubscription()
    pushManager = {
      subscribe: vi.fn(),
      getSubscription: vi.fn().mockResolvedValue(mockSubscription),
    }
    setupServiceWorker(pushManager)
  })

  afterEach(() => {
    teardownServiceWorker()
  })

  it('uses the cached id to delete the server-side row', async () => {
    localStorage.setItem('vellaris.push-subscription-id', 'sub-x')
    const deleteSpy = vi.fn().mockResolvedValue(undefined)
    const client = makeFakeClient({ del: deleteSpy })

    await unsubscribeFromPush(client)
    expect(deleteSpy).toHaveBeenCalledWith('sub-x')
    expect(mockSubscription.unsubscribe).toHaveBeenCalled()
    expect(localStorage.getItem('vellaris.push-subscription-id')).toBeNull()
  })

  it('falls back to the single-list-row case when no cached id is stored', async () => {
    const listSpy = vi.fn().mockResolvedValue([
      {
        id: 'sub-y',
        friendlyName: 'iPhone',
        userAgent: null,
        createdAt: new Date(),
        lastUsedAt: null,
      },
    ])
    const deleteSpy = vi.fn().mockResolvedValue(undefined)
    const client = makeFakeClient({ list: listSpy, del: deleteSpy })

    await unsubscribeFromPush(client)
    expect(listSpy).toHaveBeenCalled()
    expect(deleteSpy).toHaveBeenCalledWith('sub-y')
  })

  it('still calls local unsubscribe when server delete fails', async () => {
    localStorage.setItem('vellaris.push-subscription-id', 'sub-z')
    const deleteSpy = vi.fn().mockRejectedValue(new Error('boom'))
    const client = makeFakeClient({ del: deleteSpy })
    await unsubscribeFromPush(client)
    expect(mockSubscription.unsubscribe).toHaveBeenCalled()
  })
})

interface ClientStubs {
  publicKey?: () => Promise<{ publicKey: string; subject: string }>
  register?: ReturnType<typeof vi.fn>
  list?: ReturnType<typeof vi.fn>
  del?: ReturnType<typeof vi.fn>
}

function makeFakeClient(stubs: ClientStubs = {}): import('../api/client.ts').VellarisClient {
  const fake = {
    getPushPublicKey:
      stubs.publicKey ??
      (async () => ({
        publicKey: 'BPI78kIu3wPiYmUKXjYpzVhtREGqpjdvAaZbpngeY-V_Vg_8Mvfzs0jvLNRz_e8N',
        subject: 'mailto:ops@example.com',
      })),
    registerPushSubscription:
      stubs.register ??
      vi.fn().mockResolvedValue({
        id: 'sub-1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        friendlyName: 'iPhone',
        userAgent: 'iPhone Safari',
        createdAt: new Date(),
      }),
    listPushSubscriptions: stubs.list ?? vi.fn().mockResolvedValue([]),
    deletePushSubscription: stubs.del ?? vi.fn().mockResolvedValue(undefined),
  }
  return fake as unknown as import('../api/client.ts').VellarisClient
}

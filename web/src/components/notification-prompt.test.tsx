import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NotificationPrompt } from './notification-prompt.tsx'

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
    value: {
      permission,
      requestPermission: vi.fn().mockResolvedValue(permission),
    },
  })
}

function makeFakeClient(): import('../api/client.ts').VellarisClient {
  return {
    getPushPublicKey: vi.fn(),
    registerPushSubscription: vi.fn(),
    listPushSubscriptions: vi.fn(),
    deletePushSubscription: vi.fn(),
  } as unknown as import('../api/client.ts').VellarisClient
}

describe('NotificationPrompt', () => {
  afterEach(() => {
    withoutServiceWorker()
    delete (globalThis as unknown as { Notification?: unknown }).Notification
  })

  it('renders nothing while serverAvailable is null', async () => {
    render(
      <NotificationPrompt client={makeFakeClient()} serverAvailable={null} appearDelayMs={0} />,
    )
    // Allow microtasks to flush.
    await Promise.resolve()
    expect(screen.queryByTestId('notification-prompt')).toBeNull()
  })

  it('renders nothing when the server has push disabled', async () => {
    render(
      <NotificationPrompt client={makeFakeClient()} serverAvailable={false} appearDelayMs={0} />,
    )
    await Promise.resolve()
    expect(screen.queryByTestId('notification-prompt')).toBeNull()
  })

  it('shows the soft prompt on default permission', async () => {
    withServiceWorker({ getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() })
    setNotification('default')

    render(
      <NotificationPrompt client={makeFakeClient()} serverAvailable={true} appearDelayMs={0} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('notification-prompt')).toBeInTheDocument()
    })
  })

  it('shows the iOS hint when iOS Safari is not standalone', async () => {
    withoutServiceWorker()
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/605',
    })

    render(
      <NotificationPrompt client={makeFakeClient()} serverAvailable={true} appearDelayMs={0} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('notification-prompt-ios')).toBeInTheDocument()
    })
  })

  it("renders nothing when user is already 'granted-subscribed'", async () => {
    withServiceWorker({
      getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://x' }),
      subscribe: vi.fn(),
    })
    setNotification('granted')

    render(
      <NotificationPrompt client={makeFakeClient()} serverAvailable={true} appearDelayMs={0} />,
    )
    // Wait long enough for the detectPermissionState chain to resolve.
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByTestId('notification-prompt')).toBeNull()
  })
})

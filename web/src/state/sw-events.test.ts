import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeContainer {
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

let onSyncEvent: typeof import('./sw-events.ts').onSyncEvent

describe('sw-events.onSyncEvent', () => {
  let originalServiceWorker: PropertyDescriptor | undefined
  let container: FakeContainer

  beforeEach(async () => {
    originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
    container = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: container,
    })
    // The module installs its message listener on first subscription;
    // resetting modules per test guarantees a clean slate.
    vi.resetModules()
    ;({ onSyncEvent } = await import('./sw-events.ts'))
  })

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
    }
  })

  function dispatchMessage(data: unknown): void {
    const handler = container.addEventListener.mock.calls[0]?.[1] as
      | ((event: MessageEvent) => void)
      | undefined
    if (!handler) throw new Error('no handler installed')
    handler(new MessageEvent('message', { data }))
  }

  it('forwards sync-done messages to subscribers', () => {
    const listener = vi.fn()
    onSyncEvent(listener)
    dispatchMessage({ type: 'sync-done', url: 'https://x/y', method: 'POST', status: 201 })
    expect(listener).toHaveBeenCalledWith({
      type: 'sync-done',
      url: 'https://x/y',
      method: 'POST',
      status: 201,
    })
  })

  it('ignores unrelated messages', () => {
    const listener = vi.fn()
    onSyncEvent(listener)
    dispatchMessage({ type: 'something-else' })
    dispatchMessage(undefined)
    expect(listener).not.toHaveBeenCalled()
  })

  it('honors unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = onSyncEvent(listener)
    unsubscribe()
    dispatchMessage({ type: 'sync-done', url: 'x', method: 'POST', status: 201 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps other subscribers alive when one throws', () => {
    const failing = vi.fn(() => {
      throw new Error('boom')
    })
    const ok = vi.fn()
    onSyncEvent(failing)
    onSyncEvent(ok)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    dispatchMessage({ type: 'sync-failed', url: 'x', method: 'POST', status: 500 })
    expect(failing).toHaveBeenCalled()
    expect(ok).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

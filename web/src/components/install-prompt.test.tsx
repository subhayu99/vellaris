import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InstallPrompt } from './install-prompt.tsx'

interface FakeBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function makeFakeEvent(outcome: 'accepted' | 'dismissed'): FakeBeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt') as FakeBeforeInstallPromptEvent
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome })
  return event
}

describe('InstallPrompt', () => {
  let originalUserAgent: PropertyDescriptor | undefined

  beforeEach(() => {
    originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
  })

  afterEach(() => {
    if (originalUserAgent) {
      Object.defineProperty(navigator, 'userAgent', originalUserAgent)
    }
  })

  function setUserAgent(ua: string): void {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua })
  }

  it('renders nothing on default desktop user-agents until beforeinstallprompt fires', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130')
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
    expect(screen.queryByTestId('install-prompt-ios')).toBeNull()
  })

  it('shows the install prompt after capturing beforeinstallprompt', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/130')
    render(<InstallPrompt />)
    act(() => {
      window.dispatchEvent(makeFakeEvent('accepted'))
    })
    expect(screen.getByTestId('install-prompt')).toBeInTheDocument()
  })

  it('invokes the deferred prompt on click', async () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/130')
    render(<InstallPrompt />)
    const event = makeFakeEvent('accepted')
    act(() => {
      window.dispatchEvent(event)
    })
    fireEvent.click(screen.getByTestId('install-prompt-action'))
    expect(event.prompt).toHaveBeenCalled()
  })

  it('shows the iOS hint on iPhone Safari', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/605')
    render(<InstallPrompt />)
    expect(screen.getByTestId('install-prompt-ios')).toBeInTheDocument()
    expect(screen.getByTestId('install-prompt-ios')).toHaveTextContent(/Add to Home Screen/i)
  })

  it('hides itself when dismissed and remembers across renders', () => {
    setUserAgent('Mozilla/5.0 (iPhone) Safari')
    const { unmount } = render(<InstallPrompt />)
    expect(screen.getByTestId('install-prompt-ios')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('install-prompt-ios-dismiss'))
    expect(screen.queryByTestId('install-prompt-ios')).toBeNull()

    unmount()
    render(<InstallPrompt />)
    // The dismissal is per-session via sessionStorage; remount must respect it.
    expect(screen.queryByTestId('install-prompt-ios')).toBeNull()
  })
})

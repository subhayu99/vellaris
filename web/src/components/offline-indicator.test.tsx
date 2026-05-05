import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { OfflineIndicator } from './offline-indicator.tsx'

describe('OfflineIndicator', () => {
  let originalOnLine: PropertyDescriptor | undefined

  beforeEach(() => {
    originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine')
  })

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine)
    }
  })

  function setOnLine(value: boolean): void {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  }

  it('renders nothing when navigator.onLine is true', () => {
    setOnLine(true)
    render(<OfflineIndicator />)
    expect(screen.queryByTestId('offline-indicator')).toBeNull()
  })

  it('renders the offline pill when navigator.onLine is false', () => {
    setOnLine(false)
    render(<OfflineIndicator />)
    const pill = screen.getByTestId('offline-indicator')
    expect(pill).toHaveTextContent(/offline/i)
    expect(pill).toHaveAttribute('title', expect.stringMatching(/offline/i))
  })

  it('flips on online/offline events', () => {
    setOnLine(true)
    render(<OfflineIndicator />)
    expect(screen.queryByTestId('offline-indicator')).toBeNull()

    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('offline-indicator')).toBeInTheDocument()

    act(() => {
      setOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByTestId('offline-indicator')).toBeNull()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SignupRoute } from './signup.tsx'
import { setServerUrl } from '../state/server.ts'
import { hasWrappedKey, setWrappedKey } from '../state/keystore.ts'

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignupRoute />} />
        <Route path="/connect" element={<div data-testid="connect-route">connect</div>} />
        <Route path="/login" element={<div data-testid="login-route">login</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<SignupRoute />', () => {
  it('redirects to /connect if no server URL is cached', () => {
    renderWithRouter()
    expect(screen.getByTestId('connect-route')).toBeInTheDocument()
  })

  it('renders the form when a server URL is cached', () => {
    setServerUrl('http://localhost:8000')
    renderWithRouter()
    expect(screen.getByTestId('signup-username')).toBeInTheDocument()
    expect(screen.getByTestId('signup-email')).toBeInTheDocument()
    expect(screen.getByTestId('signup-passphrase')).toBeInTheDocument()
    expect(screen.getByTestId('signup-confirm')).toBeInTheDocument()
  })

  it('rejects an invalid username before any crypto runs', async () => {
    setServerUrl('http://localhost:8000')
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    renderWithRouter()

    fireEvent.change(screen.getByTestId('signup-username'), { target: { value: 'no spaces!' } })
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByTestId('signup-passphrase'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByTestId('signup-confirm'), { target: { value: 'longenough' } })
    fireEvent.submit(screen.getByTestId('signup-submit').closest('form')!)

    await waitFor(() => expect(screen.getByText(/Username must be 1–64 chars/)).toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(hasWrappedKey()).toBe(false)
  })

  it('still renders the form when a wrapped key is already cached, with a replace warning', () => {
    setServerUrl('http://localhost:8000')
    setWrappedKey(new Uint8Array([0x01, 0x02, 0x03]))
    renderWithRouter()
    // The form must render — pre-v0.3.2, this route auto-redirected to
    // /login the moment hasWrappedKey() returned true, breaking the
    // "Create an account" link on /login itself for returning users.
    expect(screen.getByTestId('signup-username')).toBeInTheDocument()
    expect(screen.getByTestId('signup-replacing-key-warning')).toBeInTheDocument()
    expect(screen.queryByTestId('login-route')).not.toBeInTheDocument()
  })

  it('rejects mismatched passphrases before any crypto runs', async () => {
    setServerUrl('http://localhost:8000')
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    renderWithRouter()

    fireEvent.change(screen.getByTestId('signup-username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByTestId('signup-passphrase'), { target: { value: 'firstphrase' } })
    fireEvent.change(screen.getByTestId('signup-confirm'), { target: { value: 'differentone' } })
    fireEvent.submit(screen.getByTestId('signup-submit').closest('form')!)

    await waitFor(() => expect(screen.getByText(/don.t match/i)).toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(hasWrappedKey()).toBe(false)
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoginRoute } from './login.tsx'
import { setServerUrl } from '../state/server.ts'
import { setWrappedKey } from '../state/keystore.ts'

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/connect" element={<div data-testid="connect-route">connect</div>} />
        <Route path="/signup" element={<div data-testid="signup-route">signup</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<LoginRoute />', () => {
  it('redirects to /connect if no server URL is cached', () => {
    renderWithRouter()
    expect(screen.getByTestId('connect-route')).toBeInTheDocument()
  })

  it('redirects to /signup if no wrapped key exists', () => {
    setServerUrl('http://localhost:8000')
    renderWithRouter()
    expect(screen.getByTestId('signup-route')).toBeInTheDocument()
  })

  it('renders the form when both server URL and wrapped key are present', () => {
    setServerUrl('http://localhost:8000')
    // Any non-empty blob with version 0x01 lets `hasWrappedKey()` return true.
    setWrappedKey(new Uint8Array([0x01, 0x02, 0x03]))
    renderWithRouter()
    expect(screen.getByTestId('login-username')).toBeInTheDocument()
    expect(screen.getByTestId('login-passphrase')).toBeInTheDocument()
    expect(screen.getByTestId('login-submit')).toBeInTheDocument()
  })

  it('rejects empty submissions before any network call', async () => {
    setServerUrl('http://localhost:8000')
    setWrappedKey(new Uint8Array([0x01, 0x02, 0x03]))
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    renderWithRouter()

    fireEvent.submit(screen.getByTestId('login-submit').closest('form')!)

    await waitFor(() =>
      expect(screen.getByText(/username and passphrase are required/i)).toBeInTheDocument(),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

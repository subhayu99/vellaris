import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SignupRoute } from './signup.tsx'
import { setServerUrl } from '../state/server.ts'
import { hasWrappedKey } from '../state/keystore.ts'

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

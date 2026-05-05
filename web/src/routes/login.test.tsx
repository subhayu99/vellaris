import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginRoute } from './login.tsx'
import { setServerUrl } from '../state/server.ts'
import { __resetKeystoreForTests, setWrappedKey } from '../state/keystore.ts'

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

beforeEach(() => {
  // Each test gets a fresh keystore so previous tests' setWrappedKey()
  // calls don't bleed in via the module-level _cache singleton.
  __resetKeystoreForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<LoginRoute />', () => {
  it('redirects to /connect if no server URL is cached', () => {
    renderWithRouter()
    expect(screen.getByTestId('connect-route')).toBeInTheDocument()
  })

  it('renders the form even with no wrapped key — the import flow handles it', () => {
    setServerUrl('http://localhost:8000')
    renderWithRouter()
    expect(screen.getByTestId('login-username')).toBeInTheDocument()
    expect(screen.getByTestId('login-passphrase')).toBeInTheDocument()
    expect(screen.getByTestId('login-submit')).toBeInTheDocument()
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

  it('on a fresh device, fetches the wrapped key from /key-blobs/by-username on submit', async () => {
    setServerUrl('http://localhost:8000')
    // No setWrappedKey — this is the fresh-device scenario.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/key-blobs/by-username/')) {
        return new Response(
          JSON.stringify({
            user_id: '00000000-0000-0000-0000-000000000000',
            wrapped_key: 'AQID', // base64 of [0x01, 0x02, 0x03]
            updated_at: new Date().toISOString(),
          }),
          { status: 200 },
        )
      }
      // Any subsequent request — let the test focus on the import step
      // and ignore the downstream Argon2id work, which would need a
      // valid blob to round-trip and isn't what this test covers.
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithRouter()
    fireEvent.change(screen.getByTestId('login-username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByTestId('login-passphrase'), { target: { value: 'pw' } })
    fireEvent.submit(screen.getByTestId('login-submit').closest('form')!)

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(calls.some((u) => u.endsWith('/key-blobs/by-username/alice'))).toBe(true)
    })
  })

  it('on a fresh device with no server-saved key, surfaces a helpful 404 message', async () => {
    setServerUrl('http://localhost:8000')
    const fetchMock = vi.fn(
      async () => new Response('{"detail":"no key blob stored"}', { status: 404 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderWithRouter()
    fireEvent.change(screen.getByTestId('login-username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByTestId('login-passphrase'), { target: { value: 'pw' } })
    fireEvent.submit(screen.getByTestId('login-submit').closest('form')!)

    await waitFor(() =>
      expect(screen.getByText(/no saved key found for "alice"/i)).toBeInTheDocument(),
    )
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectRoute } from './connect.tsx'
import { clearServerUrl, getServerUrl } from '../state/server.ts'
import { clearWrappedKey } from '../state/keystore.ts'

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/connect']}>
      <Routes>
        <Route path="/connect" element={<ConnectRoute />} />
        <Route path="/signup" element={<div data-testid="signup-route">signup</div>} />
        <Route path="/login" element={<div data-testid="login-route">login</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  clearServerUrl()
  clearWrappedKey()
  vi.unstubAllGlobals()
})

describe('<ConnectRoute />', () => {
  it('redirects to /signup after a successful healthz', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input
      void _init
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithRouter()
    const input = screen.getByTestId('server-url-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'localhost:8000' } })
    fireEvent.submit(screen.getByTestId('connect-submit').closest('form')!)

    await waitFor(() => expect(screen.getByTestId('signup-route')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://localhost:8000/healthz')
    expect(getServerUrl()).toBe('https://localhost:8000')
  })

  it('shows a clear error when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    renderWithRouter()
    fireEvent.change(screen.getByTestId('server-url-input'), {
      target: { value: 'down.example.com' },
    })
    fireEvent.submit(screen.getByTestId('connect-submit').closest('form')!)

    await waitFor(() => expect(screen.getByText(/couldn't reach/i)).toBeInTheDocument())
    expect(getServerUrl()).toBeNull()
  })

  it('surfaces non-200 status with the server detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: 'service unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )

    renderWithRouter()
    fireEvent.change(screen.getByTestId('server-url-input'), {
      target: { value: 'broken.example.com' },
    })
    fireEvent.submit(screen.getByTestId('connect-submit').closest('form')!)

    await waitFor(() => expect(screen.getByText(/HTTP 503/)).toBeInTheDocument())
    expect(screen.getByText(/service unavailable/)).toBeInTheDocument()
    expect(getServerUrl()).toBeNull()
  })
})

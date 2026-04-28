import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DashboardRoute } from './dashboard.tsx'
import { setServerUrl } from '../state/server.ts'
import { setToken, setCachedUser } from '../state/session.ts'
import { setWrappedKey } from '../state/keystore.ts'
import { setUnwrappedPem } from '../state/key-cache.ts'

function renderDashboard(scope = 'shared') {
  return render(
    <MemoryRouter initialEntries={[`/dashboard?scope=${scope}`]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardRoute />} />
        <Route path="/connect" element={<div data-testid="connect-route">connect</div>} />
        <Route path="/login" element={<div data-testid="login-route">login</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<DashboardRoute /> request behaviour', () => {
  it('fires GET /documents exactly once per mount, not in a refetch loop', async () => {
    // Stand up the auth state DashboardLayout's guards expect.
    setServerUrl('http://localhost:8000')
    setToken('test-token')
    setCachedUser({
      id: '00000000-0000-0000-0000-000000000001',
      username: 'alice',
      email: 'alice@example.com',
    })
    setWrappedKey(new Uint8Array([0x01]))
    setUnwrappedPem(new TextEncoder().encode('-----BEGIN PRIVATE KEY-----\n…'))

    // Track every fetch call. The bug we're guarding against drained the
    // server's 120/min rate bucket in seconds; a healthy mount should make a
    // single /documents call (we don't care what /me / /key-blobs/me etc. do).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/documents?scope=')) {
        // Empty list — no per-doc fan-out, no decryption fan-out.
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Any other endpoint (none expected here) → 200 empty.
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDashboard('shared')

    // Wait long enough for the bug-loop to manifest if the regression came
    // back. 200ms is generous — the bug fired on every render commit.
    await waitFor(
      () => {
        const documentsCalls = fetchMock.mock.calls.filter(([input]) =>
          (typeof input === 'string' ? input : input.toString()).includes('/documents?scope='),
        )
        expect(documentsCalls.length).toBeGreaterThanOrEqual(1)
      },
      { timeout: 500 },
    )

    // Sit and watch — refetch loop would push this number up over the next
    // tick. A healthy mount stays at 1.
    await new Promise((r) => setTimeout(r, 200))
    const documentsCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : input.toString()).includes('/documents?scope='),
    )
    expect(documentsCalls.length).toBe(1)
    expect(documentsCalls[0][0]).toBe('http://localhost:8000/documents?scope=shared')
  })
})

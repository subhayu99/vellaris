import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocDetailRoute } from './doc-detail.tsx'
import { bytesToBase64 } from '../api/_b64.ts'
import { setServerUrl } from '../state/server.ts'
import { setCachedUser, setToken } from '../state/session.ts'
import { setWrappedKey } from '../state/keystore.ts'
import { setUnwrappedPem } from '../state/key-cache.ts'

const ALICE = '00000000-0000-0000-0000-000000000001'
const BOB = '00000000-0000-0000-0000-000000000002'
const DOC_ID = '99999999-9999-9999-9999-999999999999'

function renderDocDetail(id = DOC_ID) {
  return render(
    <MemoryRouter initialEntries={[`/doc/${id}`]}>
      <Routes>
        <Route path="/doc/:id" element={<DocDetailRoute />} />
        <Route path="/connect" element={<div data-testid="connect-route">connect</div>} />
        <Route path="/login" element={<div data-testid="login-route">login</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function authedAlice() {
  setServerUrl('http://localhost:8000')
  setToken('test-token')
  setCachedUser({ id: ALICE, username: 'alice', email: 'alice@example.com' })
  setWrappedKey(new Uint8Array([0x01]))
  // The component still attempts to decrypt the filename on mount; the
  // placeholder PEM will fail, but that lands in the error pane and doesn't
  // gate chip rendering (chips are conditional on `download`, not `filename`).
  setUnwrappedPem(new TextEncoder().encode('placeholder-pem'))
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ownerDownloadResponse() {
  return jsonOk({
    id: DOC_ID,
    owner_id: ALICE,
    encrypted_filename: bytesToBase64(new Uint8Array([0])),
    encrypted_dek: bytesToBase64(new Uint8Array([0])),
    ciphertext: bytesToBase64(new Uint8Array([0])),
    content_hash: 'sha256:test',
    access: [
      { user_id: ALICE, username: 'alice' },
      { user_id: BOB, username: 'bob' },
    ],
  })
}

function nonOwnerDownloadResponse() {
  return jsonOk({
    id: DOC_ID,
    owner_id: BOB,
    encrypted_filename: bytesToBase64(new Uint8Array([0])),
    encrypted_dek: bytesToBase64(new Uint8Array([0])),
    ciphertext: bytesToBase64(new Uint8Array([0])),
    content_hash: 'sha256:test',
    access: null,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<DocDetailRoute /> access chips', () => {
  it('renders a chip per grant for the owner with revoke X on non-self chips only', async () => {
    authedAlice()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes(`/documents/${DOC_ID}`)) return ownerDownloadResponse()
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDocDetail()

    const aliceChip = await screen.findByTestId('access-chip-alice')
    const bobChip = await screen.findByTestId('access-chip-bob')
    expect(aliceChip.textContent).toContain('alice')
    expect(aliceChip.textContent).toContain('(you)')
    expect(bobChip.textContent).toContain('bob')

    // Self chip has no revoke button; co-recipient does.
    expect(screen.queryByTestId('access-chip-revoke-alice')).toBeNull()
    expect(screen.getByTestId('access-chip-revoke-bob')).toBeInTheDocument()
  })

  it('hides the access section entirely for non-owners', async () => {
    authedAlice()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes(`/documents/${DOC_ID}`)) return nonOwnerDownloadResponse()
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderDocDetail()

    // Wait for the "shared with you" header to confirm the doc loaded so
    // we're not asserting on a still-loading page.
    await waitFor(() =>
      expect(screen.getByText(/shared with you/i)).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('access-section')).toBeNull()
    expect(screen.queryByTestId('access-chips')).toBeNull()
  })
})

/**
 * Dashboard — file list with two scope tabs (Shared with me / My files).
 *
 * Calls GET /documents?scope={mine|shared|all} for the row list, then
 * fans out one GET /documents/:id per row to fetch the user's wrapped DEK
 * and decrypt the filename in the browser. The list endpoint deliberately
 * does NOT return the DEK alongside summaries; that's a per-document grant.
 *
 * Showing 5-50 files this fan-out is fine. If a future workspace has
 * thousands of files we'll either denormalize on the server (return the
 * caller's DEK in the summary) or render filenames lazily on hover.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button, Icons, InstallPrompt, Notice } from '../components/index.ts'
import { VellarisAPIError, VellarisClient, VellarisNetworkError } from '../api/index.ts'
import { isPlatformAuthenticatorAvailable, isWebAuthnSupported } from '../api/index.ts'
import type { DocumentScope, DocumentSummary } from '../api/index.ts'
import { decryptBundle, deserializePrivateKeyForOaep } from '../crypto/index.ts'
import { getServerUrl } from '../state/server.ts'
import { getCachedUser, getToken } from '../state/session.ts'
import { getUnwrappedPem, hasUnwrappedPem } from '../state/key-cache.ts'
import {
  formatRelativeTime,
  readDashboardRefresh,
  rememberDashboardRefresh,
} from '../state/dashboard-cache.ts'
import { DashboardLayout } from './_dashboard-layout.tsx'

// Per-session dismissal: the banner re-appears next time the user signs
// in fresh, but stays out of their face for the rest of this session.
// localStorage would be too sticky (we *want* the nag eventually if they
// keep ignoring it); a single session is the right cadence.
const PASSKEY_NUDGE_DISMISSED_KEY = 'vellaris.dashboard.passkey-nudge-dismissed'

interface FileRow {
  summary: DocumentSummary
  filename: string | null
  ownedByMe: boolean
  decryptError: string | null
}

const SCOPES: { value: DocumentScope; label: string }[] = [
  { value: 'shared', label: 'Shared with me' },
  { value: 'mine', label: 'My files' },
]

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function shortHash(h: string): string {
  // sha256:abc123…  → abc123…
  const colon = h.indexOf(':')
  const body = colon >= 0 ? h.slice(colon + 1) : h
  return `${body.slice(0, 8)}…${body.slice(-4)}`
}

export function DashboardRoute() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const scopeParam = params.get('scope')
  const scope: DocumentScope = scopeParam === 'mine' || scopeParam === 'all' ? scopeParam : 'shared'

  // Read once on mount. getCachedUser() JSON.parses on every call, so a fresh
  // object identity each render would put `user` in the useEffect deps and
  // trip an infinite refetch loop (~drains the server's 120-req/min bucket
  // in seconds → 429 → cascading "Failed to fetch" elsewhere in the app).
  const serverUrl = useMemo(() => getServerUrl(), [])
  const token = useMemo(() => getToken(), [])
  const user = useMemo(() => getCachedUser(), [])

  const [rows, setRows] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(() =>
    user ? readDashboardRefresh(user.id, scope) : null,
  )
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  // Passkey-nudge banner state. We render it only when:
  //   1. The browser supports WebAuthn AND has a platform authenticator
  //      (Touch ID / Windows Hello / Android biometric) — no point
  //      nudging if they couldn't act on it.
  //   2. The user has zero registered passkeys server-side.
  //   3. They haven't dismissed the banner this session.
  // Tristate so we don't render anything during the probe.
  const [passkeyNudge, setPasskeyNudge] = useState<'show' | 'hide' | null>(null)

  const client = useMemo(() => {
    if (!serverUrl || !token) return null
    return new VellarisClient(serverUrl, { token })
  }, [serverUrl, token])

  useEffect(() => {
    if (!client || !user) return
    // If the in-memory key cache has been wiped (page reload, logout in
    // another tab), DashboardLayout is about to redirect to /login — don't
    // fire a fetch we'll never decrypt and that would surface a confusing
    // "Private key cache is empty" toast first.
    if (!hasUnwrappedPem()) return

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const privKey = (async () => {
        const pem = getUnwrappedPem()
        if (!pem) throw new Error('Private key cache is empty — please sign in again.')
        return deserializePrivateKeyForOaep(pem)
      })()

      try {
        const summaries = await client!.listDocuments(scope)
        if (cancelled) return

        const now = new Date()
        rememberDashboardRefresh(user!.id, scope, now)
        setLastRefreshedAt(now)

        // Render skeletons immediately, then fan out per-doc fetches.
        const initial: FileRow[] = summaries.map((summary) => ({
          summary,
          filename: null,
          ownedByMe: summary.ownerId === user!.id,
          decryptError: null,
        }))
        setRows(initial)
        setLoading(false)

        const oaepKey = await privKey
        await Promise.all(
          summaries.map(async (summary, idx) => {
            try {
              const download = await client!.downloadDocument(summary.id)
              if (cancelled) return
              // Decrypt JUST the filename — don't pull the whole ciphertext into memory yet.
              const dec = await decryptBundle({
                ciphertextBlob: download.ciphertext,
                encryptedFilenameBlob: download.encryptedFilename,
                encryptedDek: download.encryptedDek,
                privateKey: oaepKey,
              })
              setRows((prev) => {
                if (cancelled) return prev
                const next = [...prev]
                if (next[idx]) {
                  next[idx] = { ...next[idx], filename: dec.filename }
                }
                return next
              })
            } catch (err) {
              setRows((prev) => {
                if (cancelled) return prev
                const next = [...prev]
                if (next[idx]) {
                  next[idx] = { ...next[idx], decryptError: (err as Error).message }
                }
                return next
              })
            }
          }),
        )
      } catch (err) {
        if (cancelled) return
        if (err instanceof VellarisNetworkError) {
          setError(`Couldn't reach ${serverUrl}.`)
        } else if (err instanceof VellarisAPIError) {
          setError(`Server returned HTTP ${err.status}: ${err.detail}`)
        } else {
          setError((err as Error).message)
        }
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [client, scope, serverUrl, user])

  useEffect(() => {
    function onOnline() {
      setOnline(true)
    }
    function onOffline() {
      setOnline(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Re-read the persisted timestamp when the scope changes — each scope
  // (mine/shared/all) has its own last-refreshed entry.
  useEffect(() => {
    if (!user) return
    setLastRefreshedAt(readDashboardRefresh(user.id, scope))
  }, [user, scope])

  useEffect(() => {
    if (!client) return
    let cancelled = false

    async function probePasskey() {
      if (!isWebAuthnSupported()) {
        if (!cancelled) setPasskeyNudge('hide')
        return
      }
      try {
        const dismissed = sessionStorage.getItem(PASSKEY_NUDGE_DISMISSED_KEY) === '1'
        if (dismissed) {
          if (!cancelled) setPasskeyNudge('hide')
          return
        }
      } catch {
        /* sessionStorage may be unavailable in some embeddings — fall through and probe */
      }
      const available = await isPlatformAuthenticatorAvailable()
      if (cancelled || !available) {
        if (!cancelled) setPasskeyNudge('hide')
        return
      }
      try {
        const list = await client!.listPasskeys()
        if (cancelled) return
        setPasskeyNudge(list.length === 0 ? 'show' : 'hide')
      } catch {
        // /webauthn endpoints may be absent on a downgraded server — silently skip.
        if (!cancelled) setPasskeyNudge('hide')
      }
    }

    void probePasskey()
    return () => {
      cancelled = true
    }
  }, [client])

  function dismissPasskeyNudge() {
    try {
      sessionStorage.setItem(PASSKEY_NUDGE_DISMISSED_KEY, '1')
    } catch {
      /* fine — banner just won't persist its dismissal in private browsing */
    }
    setPasskeyNudge('hide')
  }

  return (
    <DashboardLayout
      topBarTrailing={
        <Button
          variant="primary"
          size="default"
          leading={<Icons.IUpload size={14} />}
          onClick={() => navigate('/upload')}
          data-testid="upload-button"
        >
          Encrypt &amp; upload
        </Button>
      }
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <InstallPrompt />
        {!online && (
          <Notice variant="warn" data-testid="offline-hint">
            Working offline.{' '}
            {lastRefreshedAt
              ? `Last refreshed ${formatRelativeTime(lastRefreshedAt)}.`
              : 'No cached file list yet — connect to load.'}
          </Notice>
        )}
        {passkeyNudge === 'show' && (
          <div
            className="border-line bg-bg-card/60 flex flex-col items-start gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid="passkey-nudge"
          >
            <div className="flex items-center gap-3">
              <Icons.IKey size={16} />
              <div className="text-fg-2 text-[13px]">
                <span className="text-fg font-medium">Sign in faster next time.</span> Add a passkey
                so future sign-ins use Touch ID, Face ID, or your device password.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/settings')}
                data-testid="passkey-nudge-action"
              >
                Add a passkey
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismissPasskeyNudge}
                aria-label="Dismiss"
                data-testid="passkey-nudge-dismiss"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-fg font-serif text-xl tracking-tight sm:text-2xl">Files</h1>
          <div className="border-line-2 bg-bg-elev inline-flex rounded-md border p-0.5">
            {SCOPES.map((s) => {
              const active = s.value === scope
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setParams({ scope: s.value })}
                  className={[
                    'rounded px-3 py-1 text-[12.5px] transition-colors',
                    active ? 'bg-bg-card text-fg' : 'text-fg-3 hover:text-fg',
                  ].join(' ')}
                  data-testid={`scope-${s.value}`}
                  aria-pressed={active}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {error && <Notice variant="error">{error}</Notice>}

        {loading && (
          <div className="border-line text-fg-3 flex items-center justify-center rounded-lg border py-16">
            Loading…
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="border-line-2 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <Icons.IFolder size={28} />
            <div className="text-fg-2">
              {scope === 'mine'
                ? "You haven't uploaded anything yet."
                : 'Nothing has been shared with you yet.'}
            </div>
            {scope === 'mine' && (
              <Button
                variant="secondary"
                size="default"
                leading={<Icons.IUpload size={14} />}
                onClick={() => navigate('/upload')}
              >
                Upload your first file
              </Button>
            )}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <ul className="divide-line border-line bg-bg-card/40 flex flex-col divide-y rounded-lg border">
            {rows.map((row) => (
              <li key={row.summary.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/doc/${row.summary.id}`)}
                  className="hover:bg-line focus-visible:outline-gold/60 flex w-full items-center gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 sm:gap-4 sm:px-4"
                  data-testid={`row-${row.summary.id}`}
                  aria-label={
                    row.filename
                      ? `Open ${row.filename}`
                      : 'Open document (filename still decrypting)'
                  }
                >
                  <Icons.IFile size={16} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-fg truncate text-[14px]">
                        {row.filename ??
                          (row.decryptError ? (
                            <span className="text-danger">{row.decryptError}</span>
                          ) : (
                            <span className="text-fg-3">Decrypting…</span>
                          ))}
                      </span>
                      {row.ownedByMe && (
                        <span className="border-line-2 text-fg-3 rounded-full border px-1.5 py-px text-[10px] tracking-wider uppercase">
                          owned
                        </span>
                      )}
                    </div>
                    <div className="text-fg-3 mt-0.5 flex gap-3 text-[11.5px]">
                      <span>{formatBytes(row.summary.ciphertextSize)}</span>
                      <span className="font-mono">{shortHash(row.summary.contentHash)}</span>
                      <span>{formatDate(row.summary.createdAt.toISOString())}</span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  )
}

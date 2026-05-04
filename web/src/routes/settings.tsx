/**
 * Settings — account / server / keys.
 *
 * Three sections:
 *   - Account: username, email, public-key fingerprint (SHA-256 of the
 *     SPKI DER bytes, hex-formatted into colon-separated 2-byte groups —
 *     same format the cert-fingerprint UI from the JSX prototype uses).
 *   - Server: current URL + "Connect to a different server" button that
 *     wipes session + key cache and routes to /connect.
 *   - Keys: opt-in sync of the wrapped private-key blob to the server.
 *     Push/pull/delete via PUT/GET/DELETE /key-blobs/me. The blob is
 *     opaque to the server (passphrase-protected); pushing makes a new
 *     device able to log in just by knowing username + passphrase.
 *
 * Sign out is in the sidebar; this route keeps an explicit sign-out
 * button at the top so users can find it without hunting the sidebar.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, ConfirmDialog, Field, Icons, Input, Notice, Spinner } from '../components/index.ts'
import { IMoon, ISun } from '../marketing/icons.tsx'
import { useTheme } from '../marketing/hooks.ts'
import {
  enrollPasskey,
  PasskeyCancelledError,
  PasskeyUnsupportedError,
  PrfUnsupportedError,
} from '../state/passkey.ts'
import { isPlatformAuthenticatorAvailable, isWebAuthnSupported } from '../api/index.ts'
import type { PasskeySummary } from '../api/index.ts'
import { getUnwrappedPem } from '../state/key-cache.ts'
import {
  VellarisAPIError,
  VellarisClient,
  VellarisNetworkError,
  bytesToBase64,
} from '../api/index.ts'
import { getServerUrl, clearServerUrl } from '../state/server.ts'
import { clearSessionAndKey, getCachedUser, getToken } from '../state/session.ts'
import { getWrappedKey, setWrappedKey } from '../state/keystore.ts'
import { DashboardLayout } from './_dashboard-layout.tsx'

function formatFingerprint(hex: string): string {
  // 64 hex chars → 32 byte pairs separated by colons. Truncate to 16 groups
  // for readability — the full digest is shown in the title attribute.
  const groups: string[] = []
  for (let i = 0; i < hex.length; i += 2) {
    groups.push(hex.slice(i, i + 2))
  }
  return groups.join(':')
}

async function publicKeyFingerprint(spkiBytes: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(spkiBytes.length)
  buffer.set(spkiBytes)
  const digest = await crypto.subtle.digest('SHA-256', buffer.buffer as ArrayBuffer)
  const view = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, '0')
  }
  return formatFingerprint(hex)
}

function defaultPasskeyName(): string {
  // Best-effort label so the user doesn't have to think one up. Falls back
  // to a generic string in environments without `userAgent` (SSR, locked-
  // down WebViews).
  if (typeof navigator === 'undefined') return 'Passkey'
  const ua = navigator.userAgent ?? ''
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone passkey'
  if (/Mac/.test(ua)) return 'Mac passkey'
  if (/Android/.test(ua)) return 'Android passkey'
  if (/Windows/.test(ua)) return 'Windows passkey'
  return 'Passkey'
}

function pemBodyToBytes(pem: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(pem)
  const body = text
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function SettingsRoute() {
  const navigate = useNavigate()
  // Memoize once to keep dep arrays in dashboard/doc-detail/upload stable
  // (see dashboard.tsx for the refetch-loop bug this defends against).
  const serverUrl = useMemo(() => getServerUrl(), [])
  const token = useMemo(() => getToken(), [])
  const cachedUser = useMemo(() => getCachedUser(), [])

  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)

  const [keyBlobBusy, setKeyBlobBusy] = useState(false)
  const [keyBlobNotice, setKeyBlobNotice] = useState<string | null>(null)
  const [keyBlobError, setKeyBlobError] = useState<string | null>(null)
  const [hasRemoteBlob, setHasRemoteBlob] = useState<boolean | null>(null)

  const [confirmDifferentServer, setConfirmDifferentServer] = useState(false)
  const [confirmingDeleteBlob, setConfirmingDeleteBlob] = useState(false)
  const [theme, toggleTheme] = useTheme()

  // Passkey state
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null)
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([])
  const [passkeyName, setPasskeyName] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null)
  const [confirmingDeletePasskey, setConfirmingDeletePasskey] = useState<PasskeySummary | null>(
    null,
  )

  const client = useMemo(() => {
    if (!serverUrl || !token) return null
    return new VellarisClient(serverUrl, { token })
  }, [serverUrl, token])

  useEffect(() => {
    if (!client) return
    let cancelled = false

    async function load() {
      try {
        const me = await client!.me()
        if (cancelled) return
        const spki = pemBodyToBytes(me.publicKey)
        setFingerprint(await publicKeyFingerprint(spki))
      } catch (err) {
        if (cancelled) return
        setAccountError((err as Error).message)
      }
    }
    void load()

    async function probeBlob() {
      try {
        await client!.pullKeyblob()
        if (!cancelled) setHasRemoteBlob(true)
      } catch (err) {
        if (cancelled) return
        if (err instanceof VellarisAPIError && err.status === 404) {
          setHasRemoteBlob(false)
        } else {
          setHasRemoteBlob(false)
        }
      }
    }
    void probeBlob()

    async function probePasskeys() {
      if (!isWebAuthnSupported()) {
        if (!cancelled) setPasskeySupported(false)
        return
      }
      const platform = await isPlatformAuthenticatorAvailable()
      if (cancelled) return
      setPasskeySupported(platform)
      try {
        const list = await client!.listPasskeys()
        if (!cancelled) setPasskeys(list)
      } catch {
        // Server may not support /webauthn yet; absent passkeys is a valid state.
      }
    }
    void probePasskeys()

    return () => {
      cancelled = true
    }
  }, [client])

  async function addPasskey() {
    if (!client) return
    const name = passkeyName.trim() || defaultPasskeyName()
    const pem = getUnwrappedPem()
    if (!pem) {
      setPasskeyError(
        'Your private key isn’t loaded in this tab. Sign in with your passphrase first.',
      )
      return
    }
    setPasskeyBusy(true)
    setPasskeyError(null)
    setPasskeyNotice(null)
    try {
      const summary = await enrollPasskey(client, { name, privatePem: pem })
      // We need the post-registration count to decide whether to nudge
      // the user toward adding a backup. Compute against the new array
      // rather than reading state mid-update.
      const newPasskeys = [...passkeys, summary]
      setPasskeys(newPasskeys)
      if (newPasskeys.length === 1) {
        // First passkey just landed. Without a second, recovery on a
        // lost device falls back to the passphrase only — push them
        // toward redundancy now rather than after they've forgotten.
        setPasskeyNotice(
          `Passkey "${summary.name}" registered. Consider adding a second one as a backup — ` +
            'losing your only passkey leaves the passphrase as your sole recovery anchor.',
        )
      } else {
        setPasskeyNotice(`Passkey "${summary.name}" registered.`)
      }
      setPasskeyName('')
    } catch (err) {
      if (err instanceof PasskeyCancelledError) {
        setPasskeyError('Cancelled before the authenticator finished.')
      } else if (err instanceof PrfUnsupportedError) {
        setPasskeyError(err.message)
      } else if (err instanceof PasskeyUnsupportedError) {
        setPasskeyError(err.message)
      } else {
        setPasskeyError((err as Error).message)
      }
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function removePasskey(summary: PasskeySummary) {
    if (!client) return
    setConfirmingDeletePasskey(null)
    setPasskeyBusy(true)
    setPasskeyError(null)
    setPasskeyNotice(null)
    try {
      await client.deletePasskey(summary.id)
      setPasskeys((prev) => prev.filter((p) => p.id !== summary.id))
      setPasskeyNotice(`Passkey "${summary.name}" removed.`)
    } catch (err) {
      setPasskeyError((err as Error).message)
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function pushBlob() {
    if (!client) return
    const blob = getWrappedKey()
    if (!blob) {
      setKeyBlobError('No local wrapped key found.')
      return
    }
    setKeyBlobBusy(true)
    setKeyBlobError(null)
    setKeyBlobNotice(null)
    try {
      await client.pushKeyblob(blob)
      setKeyBlobNotice('Pushed to the server.')
      setHasRemoteBlob(true)
    } catch (err) {
      if (err instanceof VellarisNetworkError) {
        setKeyBlobError(`Couldn't reach ${serverUrl}.`)
      } else {
        setKeyBlobError((err as Error).message)
      }
    } finally {
      setKeyBlobBusy(false)
    }
  }

  async function pullBlob() {
    if (!client) return
    setKeyBlobBusy(true)
    setKeyBlobError(null)
    setKeyBlobNotice(null)
    try {
      const blob = await client.pullKeyblob()
      setWrappedKey(blob)
      setKeyBlobNotice('Pulled from the server. Local wrapped key replaced.')
    } catch (err) {
      if (err instanceof VellarisAPIError && err.status === 404) {
        setKeyBlobError('No wrapped key on the server.')
      } else {
        setKeyBlobError((err as Error).message)
      }
    } finally {
      setKeyBlobBusy(false)
    }
  }

  async function deleteRemoteBlob() {
    if (!client) return
    setConfirmingDeleteBlob(false)
    setKeyBlobBusy(true)
    setKeyBlobError(null)
    setKeyBlobNotice(null)
    try {
      await client.deleteKeyblob()
      setKeyBlobNotice('Deleted from the server.')
      setHasRemoteBlob(false)
    } catch (err) {
      setKeyBlobError((err as Error).message)
    } finally {
      setKeyBlobBusy(false)
    }
  }

  function disconnectServer() {
    clearSessionAndKey()
    clearServerUrl()
    navigate('/connect')
  }

  return (
    <DashboardLayout>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-fg font-serif text-xl tracking-tight sm:text-2xl">Settings</h1>

        {/* Account */}
        <section className="border-line bg-bg-card/40 flex flex-col gap-4 rounded-lg border p-5">
          <h2 className="text-fg text-[15px] font-semibold">Account</h2>
          {accountError && <Notice variant="error">{accountError}</Notice>}
          <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-fg-3 mb-0.5 text-[10.5px] tracking-wider uppercase">Username</dt>
              <dd className="text-fg">{cachedUser?.username ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-fg-3 mb-0.5 text-[10.5px] tracking-wider uppercase">Email</dt>
              <dd className="text-fg-2 break-all">{cachedUser?.email ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-fg-3 mb-0.5 text-[10.5px] tracking-wider uppercase">
                Public-key fingerprint (SHA-256)
              </dt>
              <dd
                className="text-fg-2 font-mono text-[11px] break-all"
                title={fingerprint ?? ''}
                data-testid="key-fingerprint"
              >
                {fingerprint ?? 'computing…'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Appearance */}
        <section className="border-line bg-bg-card/40 flex flex-col gap-4 rounded-lg border p-5">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-fg text-[15px] font-semibold">Appearance</h2>
              <p className="text-fg-3 mt-0.5 text-[12.5px]">
                Theme is saved per-browser and applies across the app, marketing, and docs.
              </p>
            </div>
            <Button
              variant="secondary"
              size="default"
              leading={theme === 'dark' ? <ISun size={14} /> : <IMoon size={14} />}
              onClick={toggleTheme}
              data-testid="theme-toggle"
            >
              {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </Button>
          </div>
        </section>

        {/* Server */}
        <section className="border-line bg-bg-card/40 flex flex-col gap-4 rounded-lg border p-5">
          <h2 className="text-fg text-[15px] font-semibold">Server</h2>
          <div className="text-fg-2 font-mono text-[12.5px] break-all">{serverUrl}</div>
          {!confirmDifferentServer ? (
            <div>
              <Button
                variant="secondary"
                size="default"
                leading={<Icons.IServer size={14} />}
                onClick={() => setConfirmDifferentServer(true)}
              >
                Connect to a different server
              </Button>
            </div>
          ) : (
            <div className="border-warn/40 bg-warn/8 flex flex-col gap-3 rounded-md border p-4 text-[12.5px]">
              <div className="text-fg-2">
                Disconnecting clears your bearer token and the in-memory unwrapped key. Your local
                wrapped private key stays on this device — you can sign in again to the same server,
                or point at a new one (signup will ask for a fresh keypair on a new server).
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="secondary"
                  size="default"
                  onClick={() => setConfirmDifferentServer(false)}
                  fullWidth
                  className="sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="default"
                  onClick={disconnectServer}
                  fullWidth
                  className="sm:w-auto"
                  data-testid="disconnect-confirm"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Passkeys */}
        <section className="border-line bg-bg-card/40 flex flex-col gap-4 rounded-lg border p-5">
          <div>
            <h2 className="text-fg text-[15px] font-semibold">Passkeys</h2>
            <p className="text-fg-3 mt-0.5 text-[12.5px]">
              Sign in with your fingerprint, Face ID, or device password instead of typing your
              passphrase. Each passkey holds an encrypted copy of your private key — losing all
              passkeys is fine because your passphrase still works as the recovery anchor.
            </p>
          </div>

          {passkeySupported === false && (
            <Notice variant="info">
              This browser doesn’t expose WebAuthn. Try a recent Chrome, Edge, Safari, or Firefox.
            </Notice>
          )}

          {passkeySupported && (
            <>
              <Field
                label="Add a passkey"
                htmlFor="passkey-name"
                hint="Pick a label so you can find it later — e.g., 'Work MacBook' or 'YubiKey 5'."
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="passkey-name"
                    value={passkeyName}
                    onChange={(e) => setPasskeyName(e.target.value)}
                    placeholder={defaultPasskeyName()}
                    disabled={passkeyBusy}
                    data-testid="passkey-name"
                  />
                  <Button
                    variant="primary"
                    size="default"
                    leading={passkeyBusy ? <Spinner size={14} /> : <Icons.IKey size={14} />}
                    onClick={addPasskey}
                    disabled={passkeyBusy}
                    fullWidth
                    className="sm:w-auto"
                    data-testid="passkey-add"
                  >
                    {passkeyBusy ? 'Working…' : 'Add passkey'}
                  </Button>
                </div>
              </Field>

              {passkeys.length > 0 && (
                <ul className="border-line divide-line flex flex-col divide-y rounded-md border">
                  {passkeys.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                      data-testid={`passkey-row-${p.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-fg truncate text-[13.5px]">{p.name}</div>
                        <div className="text-fg-3 text-[11.5px]">
                          Added {p.createdAt.toLocaleDateString()}
                          {p.lastUsedAt ? ` · last used ${p.lastUsedAt.toLocaleDateString()}` : ''}
                          {p.transports.length > 0 ? ` · ${p.transports.join(', ')}` : ''}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingDeletePasskey(p)}
                        disabled={passkeyBusy}
                        data-testid={`passkey-remove-${p.id}`}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {passkeyNotice && (
                <Notice variant="success" data-testid="passkey-notice">
                  {passkeyNotice}
                </Notice>
              )}
              {passkeyError && (
                <Notice variant="error" data-testid="passkey-error">
                  {passkeyError}
                </Notice>
              )}
            </>
          )}
        </section>

        {/* Keys */}
        <section className="border-line bg-bg-card/40 flex flex-col gap-4 rounded-lg border p-5">
          <div>
            <h2 className="text-fg text-[15px] font-semibold">Wrapped key sync</h2>
            <p className="text-fg-3 mt-0.5 text-[12.5px]">
              Push your passphrase-wrapped private key to the server so a new device can log in with
              just your username + passphrase. The blob is opaque to the server — without your
              passphrase it's useless. Skip this if you want strict device-binding.
            </p>
          </div>

          <div>
            <Field label="Status">
              <div className="text-fg-2 text-[12.5px]" data-testid="keyblob-status">
                {hasRemoteBlob === null
                  ? 'checking…'
                  : hasRemoteBlob
                    ? 'A wrapped key is stored on this server.'
                    : 'No wrapped key on this server.'}
              </div>
            </Field>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="primary"
              size="default"
              leading={keyBlobBusy ? <Spinner size={14} /> : <Icons.IKey size={14} />}
              onClick={pushBlob}
              disabled={keyBlobBusy}
              fullWidth
              className="sm:w-auto"
              data-testid="keyblob-push"
            >
              {keyBlobBusy ? 'Working…' : 'Push to server'}
            </Button>
            <Button
              variant="secondary"
              size="default"
              onClick={pullBlob}
              disabled={keyBlobBusy || !hasRemoteBlob}
              fullWidth
              className="sm:w-auto"
              data-testid="keyblob-pull"
            >
              Pull from server
            </Button>
            <Button
              variant="danger"
              size="default"
              leading={<Icons.ITrash size={14} />}
              onClick={() => setConfirmingDeleteBlob(true)}
              disabled={keyBlobBusy || !hasRemoteBlob}
              fullWidth
              className="sm:w-auto"
              data-testid="keyblob-delete"
            >
              Delete server copy
            </Button>
          </div>

          {keyBlobNotice && (
            <Notice variant="success" data-testid="keyblob-notice">
              {keyBlobNotice}
            </Notice>
          )}
          {keyBlobError && <Notice variant="error">{keyBlobError}</Notice>}

          <details className="text-fg-3 text-[11px]">
            <summary className="cursor-pointer">Wrapped blob (base64)</summary>
            <div className="border-line mt-2 max-h-32 overflow-auto rounded border p-2 font-mono break-all">
              {(() => {
                const b = getWrappedKey()
                return b ? bytesToBase64(b) : '—'
              })()}
            </div>
          </details>
        </section>

        <ConfirmDialog
          open={confirmingDeleteBlob}
          title="Delete the wrapped key on this server?"
          body="You can re-push from this device anytime. The local wrapped key on this browser is not affected."
          confirmLabel={keyBlobBusy ? 'Working…' : 'Delete server copy'}
          busy={keyBlobBusy}
          onConfirm={deleteRemoteBlob}
          onCancel={() => setConfirmingDeleteBlob(false)}
          testIdPrefix="confirm-delete-blob"
        />

        <ConfirmDialog
          open={confirmingDeletePasskey !== null}
          title={
            confirmingDeletePasskey
              ? `Remove "${confirmingDeletePasskey.name}"?`
              : 'Remove passkey?'
          }
          body={
            passkeys.length <= 1
              ? "This is your last passkey. After this, only your passphrase will sign you in — and on a brand new device you'll need to type it manually."
              : 'You won’t be able to use this authenticator to sign in. Your other passkeys + your passphrase still work.'
          }
          confirmLabel={passkeyBusy ? 'Removing…' : 'Remove passkey'}
          busy={passkeyBusy}
          onConfirm={() => confirmingDeletePasskey && removePasskey(confirmingDeletePasskey)}
          onCancel={() => setConfirmingDeletePasskey(null)}
          testIdPrefix="confirm-delete-passkey"
        />
      </div>
    </DashboardLayout>
  )
}

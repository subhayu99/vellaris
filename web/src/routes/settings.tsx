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

import { Button, Field, Icons } from '../components/index.ts'
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
  const serverUrl = getServerUrl()
  const token = getToken()
  const cachedUser = getCachedUser()

  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)

  const [keyBlobBusy, setKeyBlobBusy] = useState(false)
  const [keyBlobNotice, setKeyBlobNotice] = useState<string | null>(null)
  const [keyBlobError, setKeyBlobError] = useState<string | null>(null)
  const [hasRemoteBlob, setHasRemoteBlob] = useState<boolean | null>(null)

  const [confirmDifferentServer, setConfirmDifferentServer] = useState(false)

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
    return () => {
      cancelled = true
    }
  }, [client])

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
    if (!confirm('Delete the wrapped key on the server? You can re-push from this device anytime.'))
      return
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
        <h1 className="text-fg font-serif text-2xl tracking-tight">Settings</h1>

        {/* Account */}
        <section className="border-line bg-bg-card/40 flex flex-col gap-4 rounded-lg border p-5">
          <h2 className="text-fg text-[15px] font-semibold">Account</h2>
          {accountError && <div className="text-danger text-[12.5px]">{accountError}</div>}
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
            <div className="border-warn/40 flex flex-col gap-3 rounded-md border bg-[rgba(232,183,90,0.07)] p-4 text-[12.5px]">
              <div className="text-fg-2">
                Disconnecting clears your bearer token and the in-memory unwrapped key. Your local
                wrapped private key stays on this device — you can sign in again to the same server,
                or point at a new one (signup will ask for a fresh keypair on a new server).
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="default"
                  onClick={() => setConfirmDifferentServer(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="default"
                  onClick={disconnectServer}
                  data-testid="disconnect-confirm"
                >
                  Disconnect
                </Button>
              </div>
            </div>
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

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="default"
              leading={<Icons.IKey size={14} />}
              onClick={pushBlob}
              disabled={keyBlobBusy}
              data-testid="keyblob-push"
            >
              {keyBlobBusy ? 'Working…' : 'Push to server'}
            </Button>
            <Button
              variant="secondary"
              size="default"
              onClick={pullBlob}
              disabled={keyBlobBusy || !hasRemoteBlob}
              data-testid="keyblob-pull"
            >
              Pull from server
            </Button>
            <Button
              variant="danger"
              size="default"
              leading={<Icons.ITrash size={14} />}
              onClick={deleteRemoteBlob}
              disabled={keyBlobBusy || !hasRemoteBlob}
              data-testid="keyblob-delete"
            >
              Delete server copy
            </Button>
          </div>

          {keyBlobNotice && (
            <div className="text-ok text-[12.5px]" data-testid="keyblob-notice">
              {keyBlobNotice}
            </div>
          )}
          {keyBlobError && <div className="text-danger text-[12.5px]">{keyBlobError}</div>}

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
      </div>
    </DashboardLayout>
  )
}

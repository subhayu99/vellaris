/**
 * Document detail — download, share, revoke, delete.
 *
 * /doc/:id fetches the user's view of the document (DocumentDownload):
 * encrypted filename + the user's wrapped DEK + ciphertext + (owner only)
 * the access list. We decrypt the filename + DEK on mount; the full
 * plaintext only materializes when the user clicks Download.
 *
 * Owner-only actions:
 *   - Share: resolve a username → fetch their public key → OAEP-wrap
 *     the DEK to them → POST /documents/:id/access.
 *   - Revoke from a chip: DELETE the access grant for that user_id.
 *   - Delete the document.
 *
 * Non-owners get `download.access === null` and the access section is
 * hidden so they can't enumerate co-recipients.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button, ConfirmDialog, Field, Icons, Input, Notice, Spinner } from '../components/index.ts'
import {
  VellarisAPIError,
  VellarisClient,
  VellarisNetworkError,
  type DocumentDownload,
} from '../api/index.ts'
import {
  decryptBundle,
  deserializePrivateKeyForOaep,
  deserializePublicKeyForOaep,
  oaepDecrypt,
  oaepEncrypt,
} from '../crypto/index.ts'
import { getServerUrl } from '../state/server.ts'
import { getCachedUser, getToken } from '../state/session.ts'
import { getUnwrappedPem, hasUnwrappedPem } from '../state/key-cache.ts'
import { DashboardLayout } from './_dashboard-layout.tsx'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function downloadBlob(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function DocDetailRoute() {
  const navigate = useNavigate()
  const { id = '' } = useParams<{ id: string }>()
  // Memoize once: getCachedUser() JSON.parses on each call, so without this
  // `user` would have a fresh identity every render and the useEffect below
  // would re-fire forever, draining the server's 120/min rate bucket.
  const serverUrl = useMemo(() => getServerUrl(), [])
  const token = useMemo(() => getToken(), [])
  const user = useMemo(() => getCachedUser(), [])

  const [download, setDownload] = useState<DocumentDownload | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Share state
  const [shareInput, setShareInput] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)

  // Revoke state — chip-driven; we track the busy user_id so only one chip
  // shows a spinner at a time without forcing a full disable on the rest.
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null)
  const [revokeNotice, setRevokeNotice] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const client = useMemo(() => {
    if (!serverUrl || !token) return null
    return new VellarisClient(serverUrl, { token })
  }, [serverUrl, token])

  useEffect(() => {
    if (!client || !id || !user) return
    // Same guard as dashboard — DashboardLayout redirects on missing cache.
    if (!hasUnwrappedPem()) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const dl = await client!.downloadDocument(id)
        if (cancelled) return
        setDownload(dl)

        const pem = getUnwrappedPem()
        if (!pem) throw new Error('Private key cache is empty — please sign in again.')
        const oaepKey = await deserializePrivateKeyForOaep(pem)
        const dec = await decryptBundle({
          ciphertextBlob: dl.ciphertext,
          encryptedFilenameBlob: dl.encryptedFilename,
          encryptedDek: dl.encryptedDek,
          privateKey: oaepKey,
        })
        if (cancelled) return
        setFilename(dec.filename)
      } catch (err) {
        if (cancelled) return
        if (err instanceof VellarisNetworkError) {
          setError(`Couldn't reach ${serverUrl}.`)
        } else if (err instanceof VellarisAPIError) {
          setError(`Server returned HTTP ${err.status}: ${err.detail}`)
        } else {
          setError((err as Error).message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [client, id, serverUrl, user])

  const isOwner = !!download && !!user && download.ownerId === user.id

  async function onDownload() {
    if (!download) return
    if (!filename) {
      setError('Filename has not finished decrypting yet.')
      return
    }
    try {
      const pem = getUnwrappedPem()
      if (!pem) throw new Error('Private key cache is empty.')
      const oaepKey = await deserializePrivateKeyForOaep(pem)
      const dec = await decryptBundle({
        ciphertextBlob: download.ciphertext,
        encryptedFilenameBlob: download.encryptedFilename,
        encryptedDek: download.encryptedDek,
        privateKey: oaepKey,
      })
      downloadBlob(dec.filename, dec.plaintext)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function refreshAccessList() {
    if (!client || !download) return
    try {
      const fresh = await client.downloadDocument(download.id)
      setDownload(fresh)
    } catch {
      // Non-fatal: chips will refresh on the next mount even if this fails.
    }
  }

  async function onShare() {
    if (!client || !download) return
    const name = shareInput.trim()
    if (!name) return
    // Share / revoke are deliberately not queued: a queued revoke would
    // leave the revokee with access during the queue window, which
    // breaks the access-control invariant. Fail fast when offline so
    // the user knows their grant didn't land.
    if (!navigator.onLine) {
      setShareError('Vellaris is offline. Sharing needs a live connection.')
      return
    }
    setShareBusy(true)
    setShareError(null)
    setShareNotice(null)
    try {
      // 1. Resolve the recipient.
      const recipient = await client.getUserByUsername(name)
      const recipientPub = await deserializePublicKeyForOaep(recipient.publicKey)

      // 2. Decrypt the DEK with our own private key (we already have it loaded).
      const pem = getUnwrappedPem()
      if (!pem) throw new Error('Private key cache is empty.')
      const oaepKey = await deserializePrivateKeyForOaep(pem)
      // We only need the DEK here, not the plaintext, so OAEP-decrypt directly
      // rather than going through decryptBundle.
      const dek = await oaepDecrypt(download.encryptedDek, oaepKey)

      // 3. Wrap the DEK to the new recipient.
      const wrappedForThem = await oaepEncrypt(dek, recipientPub)

      // 4. POST it.
      await client.share(download.id, { userId: recipient.id, encryptedDek: wrappedForThem })
      setShareNotice(`Shared with ${recipient.username}.`)
      setShareInput('')
      await refreshAccessList()
    } catch (err) {
      if (err instanceof VellarisAPIError && err.status === 404) {
        setShareError(`No user named "${name}".`)
      } else if (err instanceof VellarisAPIError && err.status === 403) {
        setShareError('Only the owner can share this document.')
      } else {
        setShareError((err as Error).message)
      }
    } finally {
      setShareBusy(false)
    }
  }

  async function onRevokeChip(userId: string, username: string) {
    if (!client || !download) return
    if (!navigator.onLine) {
      // Same fail-fast reasoning as onShare — a queued revoke would
      // leave access intact until the next reconnect, which is wrong.
      setRevokeError('Vellaris is offline. Revoking needs a live connection.')
      return
    }
    setRevokingUserId(userId)
    setRevokeError(null)
    setRevokeNotice(null)
    try {
      await client.revoke(download.id, userId)
      setRevokeNotice(`Revoked ${username}.`)
      await refreshAccessList()
    } catch (err) {
      if (err instanceof VellarisAPIError && err.status === 404) {
        setRevokeError(`${username} no longer has access.`)
      } else if (err instanceof VellarisAPIError && err.status === 403) {
        setRevokeError('Only the owner can revoke access.')
      } else {
        setRevokeError((err as Error).message)
      }
    } finally {
      setRevokingUserId(null)
    }
  }

  async function onDelete() {
    if (!client || !download) return
    setConfirmingDelete(false)
    setDeleting(true)
    try {
      await client.deleteDocument(download.id)
      navigate('/dashboard?scope=mine')
    } catch (err) {
      setError((err as Error).message)
      setDeleting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-fg-3 hover:bg-line hover:text-fg focus-visible:outline-gold/60 -ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-[13px] transition-colors focus-visible:outline-2 sm:min-h-0 sm:py-1"
          >
            ← Back
          </button>
        </div>

        {loading && (
          <div className="border-line text-fg-3 flex items-center justify-center rounded-lg border py-16">
            Loading…
          </div>
        )}

        {error && <Notice variant="error">{error}</Notice>}

        {!loading && download && (
          <>
            <div className="border-line bg-bg-card/40 rounded-lg border p-4 sm:p-5">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-fg-3 mb-1 text-[11px] tracking-[0.12em] uppercase">
                    {isOwner ? 'You uploaded this' : 'Shared with you'}
                  </div>
                  <h1
                    className="text-fg font-serif text-xl tracking-tight break-all sm:text-2xl"
                    data-testid="doc-filename"
                  >
                    {filename ?? <span className="text-fg-3">Decrypting…</span>}
                  </h1>
                </div>
                <Button
                  variant="primary"
                  size="default"
                  leading={<Icons.IDownload size={14} />}
                  onClick={onDownload}
                  disabled={!filename}
                  fullWidth
                  className="sm:w-auto"
                  data-testid="doc-download"
                >
                  Download
                </Button>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-3 text-[12.5px] sm:grid-cols-2">
                <div>
                  <dt className="text-fg-3 mb-0.5 text-[10.5px] tracking-wider uppercase">
                    Size (ciphertext)
                  </dt>
                  <dd className="text-fg-2">{formatBytes(download.ciphertext.length)}</dd>
                </div>
                <div>
                  <dt className="text-fg-3 mb-0.5 text-[10.5px] tracking-wider uppercase">
                    Content hash
                  </dt>
                  <dd className="text-fg-2 font-mono text-[11.5px] break-all">
                    {download.contentHash}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-3 mb-0.5 text-[10.5px] tracking-wider uppercase">
                    Document ID
                  </dt>
                  <dd className="text-fg-2 font-mono text-[11.5px] break-all">{download.id}</dd>
                </div>
                <div>
                  <dt className="text-fg-3 mb-0.5 text-[10.5px] tracking-wider uppercase">Owner</dt>
                  <dd className="text-fg-2 font-mono text-[11.5px] break-all">
                    {isOwner ? (
                      <>
                        {download.ownerId} <span className="text-fg-3 not-mono">(you)</span>
                      </>
                    ) : (
                      download.ownerId
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {isOwner && (
              <>
                <div
                  className="border-line bg-bg-card/40 flex flex-col gap-3 rounded-lg border p-5"
                  data-testid="access-section"
                >
                  <div>
                    <h2 className="text-fg text-[15px] font-semibold">Shared with</h2>
                    <p className="text-fg-3 mt-0.5 text-[12.5px]">
                      Click × to revoke. Anyone who already downloaded the file keeps their copy —
                      revoke is forward-only.
                    </p>
                  </div>
                  <ul className="flex flex-wrap gap-2" data-testid="access-chips">
                    {(download.access ?? []).map((grant) => {
                      const isSelf = grant.userId === user?.id
                      const busy = revokingUserId === grant.userId
                      return (
                        <li
                          key={grant.userId}
                          className="border-line bg-bg/30 text-fg-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]"
                          data-testid={`access-chip-${grant.username}`}
                        >
                          <span className="font-medium">
                            {grant.username}
                            {isSelf && <span className="text-fg-3 ml-1">(you)</span>}
                          </span>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => onRevokeChip(grant.userId, grant.username)}
                              disabled={busy}
                              aria-label={`Revoke ${grant.username}`}
                              className="text-fg-3 hover:text-danger disabled:text-fg-3/40 -mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                              data-testid={`access-chip-revoke-${grant.username}`}
                            >
                              <Icons.IClose size={14} />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {revokeError && (
                    <Notice variant="error" data-testid="revoke-error">
                      {revokeError}
                    </Notice>
                  )}
                  {revokeNotice && (
                    <Notice variant="success" data-testid="revoke-notice">
                      {revokeNotice}
                    </Notice>
                  )}
                </div>

                <div className="border-line bg-bg-card/40 flex flex-col gap-4 rounded-lg border p-5">
                  <div>
                    <h2 className="text-fg text-[15px] font-semibold">Share access</h2>
                    <p className="text-fg-3 mt-0.5 text-[12.5px]">
                      Wrap the document key with their public key, in your browser.
                    </p>
                  </div>
                  <Field
                    label="Recipient username"
                    htmlFor="share-input"
                    error={shareError ?? undefined}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="share-input"
                        value={shareInput}
                        onChange={(e) => setShareInput(e.target.value)}
                        placeholder="username"
                        disabled={shareBusy}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void onShare()
                          }
                        }}
                        data-testid="share-input"
                      />
                      <Button
                        variant="secondary"
                        size="default"
                        leading={shareBusy ? <Spinner size={14} /> : <Icons.IShare size={14} />}
                        onClick={onShare}
                        disabled={shareBusy || shareInput.trim().length === 0}
                        fullWidth
                        className="sm:w-auto"
                        data-testid="share-submit"
                      >
                        {shareBusy ? 'Sharing…' : 'Share'}
                      </Button>
                    </div>
                  </Field>
                  {shareNotice && (
                    <Notice variant="success" data-testid="share-notice">
                      {shareNotice}
                    </Notice>
                  )}
                </div>

                <div className="border-line flex justify-stretch border-t pt-4 sm:justify-end">
                  <Button
                    variant="danger"
                    size="default"
                    leading={<Icons.ITrash size={14} />}
                    onClick={() => setConfirmingDelete(true)}
                    disabled={deleting}
                    fullWidth
                    className="sm:w-auto"
                    data-testid="doc-delete"
                  >
                    {deleting ? 'Deleting…' : 'Delete document'}
                  </Button>
                </div>

                <ConfirmDialog
                  open={confirmingDelete}
                  title="Delete this document?"
                  body={
                    <>
                      Recipients lose access immediately. Anyone who already downloaded the file
                      keeps their copy — delete is forward-only.
                    </>
                  }
                  confirmLabel={deleting ? 'Deleting…' : 'Delete document'}
                  busy={deleting}
                  onConfirm={onDelete}
                  onCancel={() => setConfirmingDelete(false)}
                  testIdPrefix="confirm-delete-doc"
                />
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

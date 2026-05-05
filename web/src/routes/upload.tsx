/**
 * Upload route — drag-drop + recipient picker + encrypt-and-ship pipeline.
 *
 * The sequence:
 *   1. User picks a file (drop or click) — we read it into memory.
 *   2. User adds recipients by username. We resolve each via
 *      GET /users/by-username/<name> to fetch their RSA public PEM.
 *      The current user is always included (the server enforces this).
 *   3. Click "Encrypt & upload" → encryptForRecipients (fresh DEK,
 *      AES-GCM(plaintext + filename) under the DEK, RSA-OAEP-wrap the
 *      DEK once per recipient).
 *   4. POST /documents with the bundle → server stores ciphertext +
 *      one encrypted_dek per recipient.
 *   5. Navigate to /doc/<new-id>.
 *
 * The champagne-thread EncryptAnim carries the wait. For larger files
 * the encrypt step is the dominant cost; uploading happens after.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, EncryptAnim, Field, Icons, Input, Notice } from '../components/index.ts'
import { VellarisAPIError, VellarisClient, VellarisNetworkError } from '../api/index.ts'
import {
  deserializePublicKeyForOaep,
  encryptForRecipientsFromStream,
  type Recipient,
} from '../crypto/index.ts'
import { getServerUrl } from '../state/server.ts'
import { getCachedUser, getToken } from '../state/session.ts'
import { addPendingUpload } from '../state/pending-uploads.ts'
import { DashboardLayout } from './_dashboard-layout.tsx'

interface ResolvedRecipient {
  userId: string
  username: string
  publicKey: CryptoKey
  isSelf: boolean
}

type Stage = 'idle' | 'encrypting' | 'uploading' | 'error'

const STAGE_LABEL: Record<Exclude<Stage, 'idle' | 'error'>, string> = {
  encrypting: 'Encrypting on your device',
  uploading: 'Uploading ciphertext to the server',
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function UploadRoute() {
  const navigate = useNavigate()
  // Memoize once on mount — see dashboard.tsx for the refetch-loop bug
  // this guards against.
  const serverUrl = useMemo(() => getServerUrl(), [])
  const token = useMemo(() => getToken(), [])
  const user = useMemo(() => getCachedUser(), [])

  const [file, setFile] = useState<File | null>(null)
  const [recipientInput, setRecipientInput] = useState('')
  const [recipients, setRecipients] = useState<ResolvedRecipient[]>([])
  const [over, setOver] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const client = useMemo(() => {
    if (!serverUrl || !token) return null
    return new VellarisClient(serverUrl, { token })
  }, [serverUrl, token])

  // Resolve "self" recipient on mount so the user is always included.
  useEffect(() => {
    if (!client || !user) return
    let cancelled = false
    client
      .me()
      .then(async (me) => {
        if (cancelled) return
        const pubKey = await deserializePublicKeyForOaep(me.publicKey)
        setRecipients([{ userId: me.id, username: me.username, publicKey: pubKey, isSelf: true }])
      })
      .catch((err) => {
        if (cancelled) return
        setError(`Couldn't load your account: ${(err as Error).message}`)
      })
    return () => {
      cancelled = true
    }
  }, [client, user])

  function pickFile(picked: File) {
    setFile(picked)
    setError(null)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setOver(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) pickFile(dropped)
  }

  async function addRecipient() {
    if (!client) return
    const name = recipientInput.trim()
    if (!name) return
    if (recipients.some((r) => r.username === name)) {
      setResolveError('Already added.')
      return
    }
    setResolveError(null)
    try {
      const u = await client.getUserByUsername(name)
      const pub = await deserializePublicKeyForOaep(u.publicKey)
      setRecipients((prev) => [
        ...prev,
        { userId: u.id, username: u.username, publicKey: pub, isSelf: false },
      ])
      setRecipientInput('')
    } catch (err) {
      if (err instanceof VellarisAPIError && err.status === 404) {
        setResolveError(`No user named "${name}".`)
      } else {
        setResolveError((err as Error).message)
      }
    }
  }

  function removeRecipient(userId: string) {
    setRecipients((prev) => prev.filter((r) => r.userId !== userId || r.isSelf))
  }

  async function onSubmit() {
    if (!client || !file) return
    setError(null)

    try {
      setStage('encrypting')
      const recipientList: Recipient[] = recipients.map((r) => ({
        userId: r.userId,
        publicKey: r.publicKey,
      }))
      // Read via the File's ReadableStream rather than file.arrayBuffer()
      // so we don't hit ArrayBuffer size limits on multi-hundred-MB files.
      const bundle = await encryptForRecipientsFromStream({
        plaintextStream: file.stream(),
        filename: file.name,
        recipients: recipientList,
      })

      setStage('uploading')
      try {
        const summary = await client.uploadDocument({
          encryptedFilename: bundle.encryptedFilename,
          contentHash: bundle.contentHash,
          ciphertext: bundle.ciphertext,
          access: bundle.access.map((a) => ({
            userId: a.userId,
            encryptedDek: a.encryptedDek,
          })),
        })

        navigate(`/doc/${summary.id}`)
      } catch (uploadErr) {
        // The SW's BackgroundSyncPlugin queues the request before
        // surfacing the network error. If the user is genuinely offline,
        // treat that as "queued — will sync when online" and show a
        // pending row on the dashboard. Online network errors fall
        // through to the normal error path.
        if (uploadErr instanceof VellarisNetworkError && user && !navigator.onLine) {
          addPendingUpload(user.id, {
            filename: file.name,
            size: file.size,
            contentHash: bundle.contentHash,
            recipientUsernames: recipients.map((r) => r.username),
          })
          navigate('/dashboard?scope=mine&pending=1')
          return
        }
        throw uploadErr
      }
    } catch (err) {
      setStage('error')
      if (err instanceof VellarisNetworkError) {
        setError(`Couldn't reach ${serverUrl}.`)
      } else if (err instanceof VellarisAPIError) {
        setError(`Server returned HTTP ${err.status}: ${err.detail}`)
      } else {
        setError(`Something went wrong: ${(err as Error).message}`)
      }
    }
  }

  const busy = stage === 'encrypting' || stage === 'uploading'
  const canSubmit = !!file && recipients.length > 0 && !busy

  return (
    <DashboardLayout>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard?scope=mine')}
            className="text-fg-3 hover:bg-line hover:text-fg focus-visible:outline-gold/60 -ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-[13px] transition-colors focus-visible:outline-2 sm:min-h-0 sm:py-1"
          >
            ← Back
          </button>
          <h1 className="text-fg font-serif text-xl tracking-tight sm:text-2xl">
            Encrypt &amp; share
          </h1>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={[
            'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
            over ? 'border-gold bg-gold/8' : 'border-line-2 bg-bg-elev',
          ].join(' ')}
          data-testid="dropzone"
        >
          <Icons.IUpload size={28} />
          {file ? (
            <>
              <div
                className="text-fg flex items-center gap-2 text-[14px]"
                data-testid="picked-file"
              >
                <Icons.IFile size={14} />
                <span className="font-mono">{file.name}</span>
                <span className="text-fg-3">·</span>
                <span className="text-fg-3">{formatBytes(file.size)}</span>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-fg-3 hover:text-fg text-[12px] underline underline-offset-2"
              >
                Pick a different file
              </button>
            </>
          ) : (
            <>
              <div className="text-fg-2 text-[14px]">Drop a file here, or</div>
              <Button
                variant="secondary"
                size="default"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                Choose file
              </Button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            data-testid="file-input"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) pickFile(f)
            }}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Field
            label="Share with"
            htmlFor="recipient-input"
            hint="Add usernames who should be able to decrypt this file. You're always included."
            error={resolveError ?? undefined}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="recipient-input"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addRecipient()
                  }
                }}
                placeholder="username"
                disabled={busy}
                data-testid="recipient-input"
              />
              <Button
                variant="secondary"
                size="default"
                onClick={addRecipient}
                disabled={busy || recipientInput.trim().length === 0}
                fullWidth
                className="sm:w-auto"
              >
                Add
              </Button>
            </div>
          </Field>

          {recipients.length > 0 && (
            <ul className="flex flex-wrap gap-2" data-testid="recipient-chips">
              {recipients.map((r) => (
                <li
                  key={r.userId}
                  className="border-line-2 bg-bg-card text-fg-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12.5px]"
                >
                  <span>{r.username}</span>
                  {r.isSelf ? (
                    <span className="text-fg-3 text-[10.5px] tracking-wider uppercase">you</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeRecipient(r.userId)}
                      className="text-fg-3 hover:text-fg -mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full"
                      aria-label={`Remove ${r.username}`}
                      disabled={busy}
                    >
                      <Icons.IClose size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {busy && (
          <div className="border-line-2 bg-bg-elev rounded-lg border px-4 py-3">
            <EncryptAnim
              active
              label={STAGE_LABEL[stage as Exclude<Stage, 'idle' | 'error'>]}
              description="Bytes are processed in this browser. Nothing leaves your machine until ciphertext is ready."
            />
          </div>
        )}

        {error && <Notice variant="error">{error}</Notice>}

        <div className="border-line flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            size="default"
            onClick={() => navigate('/dashboard?scope=mine')}
            disabled={busy}
            fullWidth
            className="sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            leading={<Icons.IUpload size={14} />}
            disabled={!canSubmit}
            onClick={onSubmit}
            fullWidth
            className="sm:w-auto"
            data-testid="upload-submit"
          >
            {busy ? 'Working…' : 'Encrypt & upload'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}

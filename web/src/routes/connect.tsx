/**
 * Server-connect screen — first-load entry point.
 *
 * The SPA isn't pinned to any single backend; the user types in their
 * Vellaris server URL, we probe `GET /healthz`, and on success cache the
 * URL in localStorage. Subsequent visits skip this screen unless they
 * Disconnect or clear storage. The cert-fingerprint UI from the JSX
 * prototype is deferred to a follow-up phase — for now we trust HTTPS.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, VSigil } from '../components/index.ts'
import { VellarisAPIError, VellarisClient, VellarisNetworkError } from '../api/index.ts'
import { getServerUrl, setServerUrl } from '../state/server.ts'
import { hasWrappedKey } from '../state/keystore.ts'
import { AuthLayout } from './_layout.tsx'

type Status = 'idle' | 'checking' | 'error'

function normalize(input: string): string {
  let s = input.trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  return s.replace(/\/+$/, '')
}

export function ConnectRoute() {
  const navigate = useNavigate()
  const [url, setUrl] = useState(() => getServerUrl() ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const target = normalize(url)
    if (!target) {
      setError('Enter the URL of your Vellaris server.')
      setStatus('error')
      return
    }
    setStatus('checking')
    setError(null)
    try {
      const client = new VellarisClient(target)
      await client.healthz()
      setServerUrl(target)
      navigate(hasWrappedKey() ? '/login' : '/signup')
    } catch (err) {
      setStatus('error')
      if (err instanceof VellarisNetworkError) {
        setError(`Couldn't reach ${target}. Check the URL and your network.`)
      } else if (err instanceof VellarisAPIError) {
        setError(`${target} responded with HTTP ${err.status}: ${err.detail}`)
      } else {
        setError(`Unexpected error: ${(err as Error).message}`)
      }
    }
  }

  const checking = status === 'checking'

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <VSigil size={56} glow />
          <h1 className="text-fg font-serif text-3xl tracking-tight">Connect to your server</h1>
          <p className="text-fg-2 max-w-sm">
            Vellaris runs on a server you control. Paste its URL and we'll check it's reachable
            before you sign in.
          </p>
        </div>

        <Field
          label="Server URL"
          htmlFor="server-url"
          hint="A self-hosted Vellaris instance. https:// is added if you omit it."
          error={status === 'error' ? error : undefined}
        >
          <Input
            id="server-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="vault.example.org"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
            disabled={checking}
            aria-invalid={status === 'error'}
            data-testid="server-url-input"
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          size="lg"
          disabled={checking || url.trim().length === 0}
          data-testid="connect-submit"
        >
          {checking ? 'Connecting…' : 'Connect'}
        </Button>

        <div className="border-line text-fg-3 border-t pt-5 text-center text-[12.5px]">
          Don't have a server yet? See the{' '}
          <a
            href="https://github.com/subhayu99/vellaris#run-a-server"
            target="_blank"
            rel="noreferrer"
            className="text-fg-2 decoration-line-2 hover:text-fg underline underline-offset-2"
          >
            self-hosting guide
          </a>
          .
        </div>
      </form>
    </AuthLayout>
  )
}

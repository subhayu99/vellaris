/**
 * Signup screen.
 *
 * On submit:
 *   1. Generate a fresh RSA-4096 keypair in WebCrypto.
 *   2. Serialize the private key to PKCS#8 PEM, wrap it under an
 *      Argon2id-derived key from the user's passphrase, and stash the
 *      blob in localStorage. The server never sees the passphrase or
 *      the unwrapped key.
 *   3. POST /users with username + email + base64(public PEM).
 *   4. Route to /login. (Auto-login can come later; an explicit login
 *      proves the wrapped blob round-trips before the user trusts it.)
 *
 * The Argon2id step takes ~1-2s on Apple Silicon at production
 * parameters. EncryptAnim's champagne-thread carries the wait.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, EncryptAnim, Field, Input, VSigil } from '../components/index.ts'
import { VellarisAPIError, VellarisClient, VellarisNetworkError } from '../api/index.ts'
import { trackPageview } from '../components/cloudflare-beacon.tsx'
import {
  generateOaepKeypair,
  serializePrivateKey,
  serializePublicKey,
  wrapPrivateKey,
} from '../crypto/index.ts'
import { getServerUrl, clearServerUrl } from '../state/server.ts'
import { hasWrappedKey, setWrappedKey } from '../state/keystore.ts'
import { AuthLayout } from './_layout.tsx'

type Stage = 'idle' | 'generating' | 'deriving' | 'submitting' | 'error'

const STAGE_HEADLINE: Record<Exclude<Stage, 'idle' | 'error'>, string> = {
  generating: 'Generating your RSA-4096 keypair',
  deriving: 'Deriving your wrapping key',
  submitting: 'Registering with the server',
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/

export function SignupRoute() {
  const navigate = useNavigate()
  const serverUrl = getServerUrl()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')

  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!serverUrl) {
      navigate('/connect', { replace: true })
    } else if (hasWrappedKey()) {
      navigate('/login', { replace: true })
    }
  }, [navigate, serverUrl])
  useEffect(() => {
    trackPageview('/signup')
  }, [])
  if (!serverUrl || hasWrappedKey()) return null

  function disconnect() {
    clearServerUrl()
    navigate('/connect')
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!USERNAME_PATTERN.test(username) || username.length === 0 || username.length > 64) {
      setStage('error')
      setError('Username must be 1–64 chars: letters, digits, dot, underscore, dash.')
      return
    }
    if (!email.includes('@')) {
      setStage('error')
      setError('Enter a valid email.')
      return
    }
    if (passphrase.length < 8) {
      setStage('error')
      setError('Passphrase must be at least 8 characters.')
      return
    }
    if (passphrase !== confirm) {
      setStage('error')
      setError('Passphrases don’t match.')
      return
    }

    try {
      setStage('generating')
      const pair = await generateOaepKeypair()
      const privatePem = await serializePrivateKey(pair.privateKey)
      const publicPem = await serializePublicKey(pair.publicKey)

      setStage('deriving')
      const wrapped = await wrapPrivateKey(privatePem, passphrase)
      setWrappedKey(wrapped)

      setStage('submitting')
      const client = new VellarisClient(serverUrl!)
      await client.signup({ username, email, publicKey: publicPem })

      navigate('/login')
    } catch (err) {
      setStage('error')
      if (err instanceof VellarisNetworkError) {
        setError(
          `Couldn't reach ${serverUrl}. Your wrapped key is saved locally — try Login once the server is back.`,
        )
      } else if (err instanceof VellarisAPIError) {
        if (err.status === 409) {
          setError('That username or email is already taken.')
        } else {
          setError(`Server returned HTTP ${err.status}: ${err.detail}`)
        }
      } else {
        setError(`Something went wrong: ${(err as Error).message}`)
      }
    }
  }

  const busy = stage === 'generating' || stage === 'deriving' || stage === 'submitting'
  const animLabel = busy ? STAGE_HEADLINE[stage as Exclude<Stage, 'idle' | 'error'>] : undefined

  return (
    <AuthLayout serverUrl={serverUrl} onDisconnect={disconnect}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <VSigil size={42} />
          <h1 className="text-fg font-serif text-2xl tracking-tight">Create your account</h1>
          <p className="text-fg-2 text-[13px]">
            Your private key is generated in this browser. The server only sees the public half.
          </p>
        </div>

        <Field label="Username" htmlFor="signup-username">
          <Input
            id="signup-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="alice"
            autoComplete="username"
            disabled={busy}
            data-testid="signup-username"
          />
        </Field>

        <Field label="Email" htmlFor="signup-email">
          <Input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alice@example.com"
            autoComplete="email"
            disabled={busy}
            data-testid="signup-email"
          />
        </Field>

        <Field
          label="Passphrase"
          htmlFor="signup-passphrase"
          hint="Used locally to protect your private key. Never sent to the server. No recovery if you forget it."
        >
          <Input
            id="signup-passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
            disabled={busy}
            data-testid="signup-passphrase"
          />
        </Field>

        <Field
          label="Confirm passphrase"
          htmlFor="signup-confirm"
          error={stage === 'error' ? error : undefined}
        >
          <Input
            id="signup-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={busy}
            data-testid="signup-confirm"
          />
        </Field>

        {busy && (
          <div className="border-line-2 bg-bg-elev rounded-lg border px-4 py-3">
            <EncryptAnim
              active
              label={animLabel}
              description="The Argon2id step uses 256 MiB · 3 passes · 4 lanes — about 1 to 2 seconds on a modern laptop."
            />
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          size="lg"
          disabled={busy}
          data-testid="signup-submit"
        >
          {busy ? 'Working…' : 'Create account'}
        </Button>

        <div className="text-fg-3 text-center text-[12.5px]">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-fg-2 decoration-line-2 hover:text-fg underline underline-offset-2"
          >
            Sign in
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}

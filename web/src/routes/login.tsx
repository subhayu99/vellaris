/**
 * Login screen — challenge-response flow.
 *
 * On submit:
 *   1. POST /auth/challenge with the username → server returns
 *      (challenge_id, nonce, expires_at).
 *   2. Read the wrapped private key from localStorage and unwrap it
 *      with the passphrase (Argon2id-derive key, AES-GCM decrypt).
 *      Wrong passphrase ⇒ DecryptError, surfaced as "Incorrect passphrase".
 *   3. Import the PEM as an RSA-PSS private key, sign
 *      `challenge_id.bytes + nonce` (matches src/vellaris/server/routes/auth.py
 *      :_signed_blob).
 *   4. POST /auth/verify → bearer token + user. Cache both in sessionStorage
 *      (so the connection pill reads "Connected to <url> · alice" without an
 *      extra /users/me round-trip on every page).
 *   5. Navigate to /home — a placeholder until the dashboard lands.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, EncryptAnim, Field, Input, VSigil } from '../components/index.ts'
import { VellarisAPIError, VellarisClient, VellarisNetworkError } from '../api/index.ts'
import { trackPageview } from '../components/cloudflare-beacon.tsx'
import { DecryptError, deserializePrivateKeyForPss, pssSign } from '../crypto/index.ts'
import { unwrapPrivateKey } from '../crypto/worker-client.ts'
import { clearServerUrl, getServerUrl } from '../state/server.ts'
import { getWrappedKey, hasWrappedKey } from '../state/keystore.ts'
import { setCachedUser, setToken } from '../state/session.ts'
import { setUnwrappedPem } from '../state/key-cache.ts'
import { uuidToBytes } from '../util/uuid.ts'
import { AuthLayout } from './_layout.tsx'

type Stage = 'idle' | 'requesting' | 'unwrapping' | 'verifying' | 'error'

const STAGE_HEADLINE: Record<Exclude<Stage, 'idle' | 'error'>, string> = {
  requesting: 'Asking the server for a challenge',
  unwrapping: 'Unwrapping your private key',
  verifying: 'Signing the challenge and verifying',
}

export function LoginRoute() {
  const navigate = useNavigate()
  const serverUrl = getServerUrl()

  const [username, setUsername] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!serverUrl) {
      navigate('/connect', { replace: true })
    } else if (!hasWrappedKey()) {
      navigate('/signup', { replace: true })
    }
  }, [navigate, serverUrl])
  useEffect(() => {
    trackPageview('/login')
  }, [])
  if (!serverUrl || !hasWrappedKey()) return null

  function disconnect() {
    clearServerUrl()
    navigate('/connect')
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (username.length === 0 || passphrase.length === 0) {
      setStage('error')
      setError('Username and passphrase are required.')
      return
    }
    const wrapped = getWrappedKey()
    if (!wrapped) {
      setStage('error')
      setError('No local key found. Please sign up first.')
      return
    }

    try {
      setStage('requesting')
      const client = new VellarisClient(serverUrl!)
      const challenge = await client.challenge(username)

      setStage('unwrapping')
      let privatePem: Uint8Array
      try {
        privatePem = await unwrapPrivateKey(wrapped, passphrase)
      } catch (err) {
        if (err instanceof DecryptError) {
          setStage('error')
          setError('Incorrect passphrase.')
          return
        }
        throw err
      }
      const privKey = await deserializePrivateKeyForPss(privatePem)

      setStage('verifying')
      const message = new Uint8Array(16 + challenge.nonce.length)
      message.set(uuidToBytes(challenge.challengeId), 0)
      message.set(challenge.nonce, 16)
      const signature = await pssSign(message, privKey)
      const verified = await client.verify({ challengeId: challenge.challengeId, signature })

      setToken(verified.token)
      setCachedUser({
        id: verified.user.id,
        username: verified.user.username,
        email: verified.user.email,
      })
      setUnwrappedPem(privatePem)
      navigate('/dashboard?scope=shared')
    } catch (err) {
      setStage('error')
      if (err instanceof VellarisNetworkError) {
        setError(`Couldn't reach ${serverUrl}. Check the URL and your network.`)
      } else if (err instanceof VellarisAPIError) {
        if (err.status === 404) {
          setError('No such user on this server.')
        } else if (err.status === 403) {
          setError('Signature rejected. Wrong passphrase or wrong account?')
        } else {
          setError(`Server returned HTTP ${err.status}: ${err.detail}`)
        }
      } else {
        setError(`Something went wrong: ${(err as Error).message}`)
      }
    }
  }

  const busy = stage === 'requesting' || stage === 'unwrapping' || stage === 'verifying'
  const animLabel = busy ? STAGE_HEADLINE[stage as Exclude<Stage, 'idle' | 'error'>] : undefined

  return (
    <AuthLayout serverUrl={serverUrl} onDisconnect={disconnect}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <VSigil size={42} />
          <h1 className="text-fg font-serif text-2xl tracking-tight">Sign in</h1>
          <p className="text-fg-2 text-[13px]">
            We'll sign a challenge from the server with your local key. Nothing is sent that the
            server hasn't already seen.
          </p>
        </div>

        <Field label="Username" htmlFor="login-username">
          <Input
            id="login-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="alice"
            autoComplete="username"
            disabled={busy}
            data-testid="login-username"
          />
        </Field>

        <Field
          label="Passphrase"
          htmlFor="login-passphrase"
          error={stage === 'error' ? error : undefined}
        >
          <Input
            id="login-passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="current-password"
            disabled={busy}
            data-testid="login-passphrase"
          />
        </Field>

        {busy && (
          <div className="border-line-2 bg-bg-elev rounded-lg border px-4 py-3">
            <EncryptAnim
              active
              label={animLabel}
              description="Argon2id unwrapping uses 256 MiB · 3 passes · 4 lanes — about 1 to 2 seconds."
            />
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          size="lg"
          disabled={busy}
          data-testid="login-submit"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        <div className="text-fg-3 text-center text-[12.5px]">
          New device?{' '}
          <button
            type="button"
            onClick={() => navigate('/signup')}
            className="text-fg-2 decoration-line-2 hover:text-fg underline underline-offset-2"
          >
            Create an account
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}

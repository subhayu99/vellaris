/**
 * Login screen — passphrase and / or passkey sign-in.
 *
 * Three paths feed in here, depending on what this device has:
 *
 *   - **Passphrase, local wrapped key.** Returning user on the device
 *     they signed up on. Posts /auth/challenge, unwraps the local
 *     blob via Argon2id + AES-GCM, signs the challenge with PSS,
 *     posts /auth/verify. Original v0.1 flow.
 *   - **Passphrase, server-pulled wrapped key (import).** First sign-
 *     in on a fresh device for a user who pushed their wrapped blob
 *     from another device (Settings → Wrapped key sync → Push to
 *     server). Same flow as above but the SPA fetches the blob via
 *     ``GET /key-blobs/by-username/{username}`` first, seeds
 *     IndexedDB, then runs the standard challenge-response.
 *   - **Passkey (preferred when available).** Touch ID / Face ID /
 *     hardware key. Calls /webauthn/auth/begin and /finish; the
 *     WebAuthn PRF extension yields a 32-byte secret that unwraps
 *     the server-side wrapped private key blob.
 *
 * The screen always renders when a server URL is set. Users with
 * nothing on this device see "Create an account" and "Recovery
 * options" links and can pick a path.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, EncryptAnim, Field, Input, Notice, Spinner, VSigil } from '../components/index.ts'
import { VellarisAPIError, VellarisClient, VellarisNetworkError } from '../api/index.ts'
import { isPlatformAuthenticatorAvailable, isWebAuthnSupported } from '../api/index.ts'
import { trackPageview } from '../components/cloudflare-beacon.tsx'
import { Icons } from '../components/index.ts'
import { DecryptError, deserializePrivateKeyForPss, pssSign } from '../crypto/index.ts'
import { unwrapPrivateKey } from '../crypto/worker-client.ts'
import { clearServerUrl, getServerUrl } from '../state/server.ts'
import { getWrappedKey, hasWrappedKey, setWrappedKey } from '../state/keystore.ts'
import {
  loginWithPasskey,
  PasskeyCancelledError,
  PasskeyUnsupportedError,
  PrfUnsupportedError,
} from '../state/passkey.ts'
import { setCachedUser, setToken } from '../state/session.ts'
import { setUnwrappedPem } from '../state/key-cache.ts'
import { uuidToBytes } from '../util/uuid.ts'
import { AuthLayout } from './_layout.tsx'

type Stage = 'idle' | 'fetching' | 'requesting' | 'unwrapping' | 'verifying' | 'error'

const STAGE_HEADLINE: Record<Exclude<Stage, 'idle' | 'error'>, string> = {
  fetching: 'Fetching your wrapped key from the server',
  requesting: 'Asking the server for a challenge',
  unwrapping: 'Unwrapping your private key',
  verifying: 'Signing the challenge and verifying',
}

export function LoginRoute() {
  const navigate = useNavigate()
  const serverUrl = getServerUrl()
  // hasWrappedKey() reads localStorage synchronously; capture once so the
  // value is stable across the render and the effect below.
  const hasLocalKey = hasWrappedKey()

  const [username, setUsername] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)

  // null = still detecting (async probe hasn't resolved), true / false
  // = known. Tristate so we don't flash the wrong UI before the
  // platform-authenticator probe returns.
  const [passkeyAvailable, setPasskeyAvailable] = useState<boolean | null>(() =>
    isWebAuthnSupported() ? null : false,
  )
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  useEffect(() => {
    if (passkeyAvailable !== null) return
    let cancelled = false
    void isPlatformAuthenticatorAvailable().then((avail) => {
      if (!cancelled) setPasskeyAvailable(avail)
    })
    return () => {
      cancelled = true
    }
  }, [passkeyAvailable])

  useEffect(() => {
    if (!serverUrl) {
      navigate('/connect', { replace: true })
    }
  }, [navigate, serverUrl])

  useEffect(() => {
    trackPageview('/login')
  }, [])

  if (!serverUrl) return null

  function disconnect() {
    clearServerUrl()
    navigate('/connect')
  }

  async function signInWithPasskey() {
    if (!serverUrl) return
    setPasskeyError(null)
    setPasskeyBusy(true)
    try {
      const client = new VellarisClient(serverUrl)
      const result = await loginWithPasskey(client, {
        username: username.trim() || undefined,
      })
      setToken(result.auth.token)
      setCachedUser({
        id: result.auth.user.id,
        username: result.auth.user.username,
        email: result.auth.user.email,
      })
      setUnwrappedPem(result.privatePem)
      navigate('/dashboard?scope=shared')
    } catch (err) {
      if (err instanceof PasskeyCancelledError) {
        setPasskeyError('Passkey prompt was cancelled.')
      } else if (err instanceof PrfUnsupportedError) {
        setPasskeyError(err.message)
      } else if (err instanceof PasskeyUnsupportedError) {
        setPasskeyError(err.message)
      } else if (err instanceof VellarisAPIError && err.status === 401) {
        setPasskeyError('That passkey isn’t registered on this server.')
      } else if (err instanceof VellarisNetworkError) {
        setPasskeyError(`Couldn’t reach ${serverUrl}.`)
      } else {
        setPasskeyError((err as Error).message)
      }
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (username.length === 0 || passphrase.length === 0) {
      setStage('error')
      setError('Username and passphrase are required.')
      return
    }

    const client = new VellarisClient(serverUrl!)

    // First, make sure we have a wrapped key locally. If not, attempt to
    // fetch it from the server — this is the "fresh device, account
    // pushed elsewhere" import flow. The blob is opaque ciphertext on
    // the server; the passphrase below decrypts it locally.
    let wrapped = getWrappedKey()
    if (!wrapped) {
      try {
        setStage('fetching')
        wrapped = await client.pullKeyblobByUsername(username)
        setWrappedKey(wrapped)
      } catch (err) {
        setStage('error')
        if (err instanceof VellarisAPIError && err.status === 404) {
          setError(
            `No saved key found for "${username}" on this server. ` +
              'On a device where you can already sign in, push your wrapped key from ' +
              'Settings → Wrapped key sync. Or create a new account if this is your first time.',
          )
          return
        }
        if (err instanceof VellarisNetworkError) {
          setError(`Couldn't reach ${serverUrl}.`)
          return
        }
        setError(`Couldn't fetch your wrapped key: ${(err as Error).message}`)
        return
      }
    }

    try {
      setStage('requesting')
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

  const busy =
    stage === 'fetching' ||
    stage === 'requesting' ||
    stage === 'unwrapping' ||
    stage === 'verifying'
  const animLabel = busy ? STAGE_HEADLINE[stage as Exclude<Stage, 'idle' | 'error'>] : undefined
  const showPasskey = passkeyAvailable === true
  const isImportFlow = !hasLocalKey

  return (
    <AuthLayout serverUrl={serverUrl} onDisconnect={disconnect}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <VSigil size={42} />
          <h1 className="text-fg font-serif text-2xl tracking-tight">Sign in</h1>
          <p className="text-fg-2 text-[13px]">
            {isImportFlow
              ? "On a new device — we'll pull your wrapped key from the server (if you've pushed it from another device) or use your synced passkey to unlock it. Either way the unwrapping happens here, not on the server."
              : "We'll sign a challenge from the server with your local key. Nothing is sent that the server hasn't already seen."}
          </p>
        </div>

        <Field label="Username" htmlFor="login-username">
          <Input
            id="login-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="alice"
            autoComplete="username webauthn"
            disabled={busy || passkeyBusy}
            data-testid="login-username"
          />
        </Field>

        {showPasskey && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              fullWidth
              leading={passkeyBusy ? <Spinner size={14} /> : <Icons.IKey size={14} />}
              onClick={signInWithPasskey}
              disabled={busy || passkeyBusy}
              data-testid="login-passkey"
            >
              {passkeyBusy ? 'Waiting for passkey…' : 'Sign in with a passkey'}
            </Button>
            {passkeyError && (
              <Notice variant="error" data-testid="login-passkey-error">
                {passkeyError}
              </Notice>
            )}
            <div className="border-line text-fg-3 relative my-1 flex items-center text-[11px] tracking-[0.16em] uppercase before:mr-3 before:h-px before:flex-1 before:bg-current before:opacity-30 after:ml-3 after:h-px after:flex-1 after:bg-current after:opacity-30">
              or use your passphrase
            </div>
          </>
        )}

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
            disabled={busy || passkeyBusy}
            data-testid="login-passphrase"
          />
        </Field>

        {busy && (
          <div className="border-line-2 bg-bg-elev rounded-lg border px-4 py-3">
            <EncryptAnim
              active
              label={animLabel}
              description={
                stage === 'fetching'
                  ? 'Pulling the encrypted blob from the server.'
                  : 'Argon2id unwrapping uses 256 MiB · 3 passes · 4 lanes — about 1 to 2 seconds.'
              }
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

        <div className="text-fg-3 flex flex-col gap-1 text-center text-[12.5px]">
          <span>
            New device?{' '}
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="text-fg-2 decoration-line-2 hover:text-fg underline underline-offset-2"
            >
              Create an account
            </button>
          </span>
          <span>
            Lost access?{' '}
            <button
              type="button"
              onClick={() => navigate('/recover')}
              className="text-fg-2 decoration-line-2 hover:text-fg underline underline-offset-2"
            >
              Recovery options
            </button>
          </span>
        </div>
      </form>
    </AuthLayout>
  )
}

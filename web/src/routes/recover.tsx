/**
 * Recovery route — the honest version.
 *
 * Vellaris is end-to-end encrypted. No one (the operator, the server,
 * the project) holds a copy of your unwrapped private key. That's the
 * whole point: a database breach reveals ciphertext, not your files.
 *
 * The cost of that property is structural: if you lose every passkey AND
 * forget your passphrase, your documents are unrecoverable. This page
 * exists so users land on a clear explanation rather than a misleading
 * "Forgot password?" button.
 *
 * What we *can* do:
 *   1. Sign in on a device that still has your passkey synced.
 *   2. Sign in with your passphrase + a wrapped key push from a device
 *      that does (Settings → Wrapped key sync → Pull from server).
 *   3. Close the account and start over. No bytes recovered, but the
 *      record is gone and the username is freed up.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, VSigil } from '../components/index.ts'
import { trackPageview } from '../components/cloudflare-beacon.tsx'
import { getServerUrl } from '../state/server.ts'
import { AuthLayout } from './_layout.tsx'

export function RecoverRoute() {
  const navigate = useNavigate()
  const serverUrl = getServerUrl()

  useEffect(() => {
    trackPageview('/recover')
  }, [])

  return (
    <AuthLayout serverUrl={serverUrl ?? undefined}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <VSigil size={42} />
          <h1 className="text-fg font-serif text-2xl tracking-tight">Recovery options</h1>
          <p className="text-fg-2 text-[13px]">
            Vellaris encrypts your files end-to-end. The server never holds your private key. That's
            a deliberate design choice with a real cost: there is no &ldquo;reset password&rdquo;
            flow.
          </p>
        </div>

        <section className="border-line bg-bg-card/40 flex flex-col gap-3 rounded-lg border p-5">
          <h2 className="text-fg text-[14px] font-semibold">If you have your passphrase</h2>
          <p className="text-fg-2 text-[12.5px]">
            Just sign in. The login screen knows what to do whether you have a wrapped key on this
            device or not — if you don't, it pulls the encrypted blob from the server (assuming you
            pushed it from another device first via{' '}
            <strong>Settings → Wrapped key sync → Push to server</strong>) and unwraps it locally
            with your passphrase. The server only ever sees ciphertext.
          </p>
          <Button variant="primary" size="default" onClick={() => navigate('/login')} fullWidth>
            Go to sign in
          </Button>
        </section>

        <section className="border-line bg-bg-card/40 flex flex-col gap-3 rounded-lg border p-5">
          <h2 className="text-fg text-[14px] font-semibold">
            If you have a synced passkey on another device
          </h2>
          <p className="text-fg-2 text-[12.5px]">
            Sign in there. iCloud Keychain, Google Password Manager, 1Password and Bitwarden all
            sync passkeys across your devices automatically — anywhere your account reaches, your
            passkey reaches. Once you're signed in, head to Settings → Passkeys and add a new one
            for the device you're trying to use.
          </p>
        </section>

        <section className="border-line bg-bg-card/40 flex flex-col gap-3 rounded-lg border p-5">
          <h2 className="text-fg text-[14px] font-semibold">If you've lost everything</h2>
          <p className="text-fg-2 text-[12.5px]">
            We can't decrypt your files for you — we never had the key. The only thing left is to
            close the account, freeing up your username, and start over with a fresh keypair.
            Anything that was shared <em>with</em> you and you still have a download of will keep
            working with the new account once it's re-shared.
          </p>
          <p className="text-fg-3 text-[11.5px]">
            Account closure is a server operation. Contact your Vellaris server's operator (or, if
            you're self-hosting, run <code className="font-mono">vellaris-server delete-user</code>
            from the host) — there's no self-serve close-account flow yet.
          </p>
        </section>

        <div className="text-fg-3 text-center text-[12.5px]">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-fg-2 decoration-line-2 hover:text-fg underline underline-offset-2"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}

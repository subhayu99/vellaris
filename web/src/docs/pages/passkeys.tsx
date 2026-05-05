import { Link } from 'react-router-dom'

import { IFingerprint } from '../../marketing/icons.tsx'
import { DOCS_PASSKEYS, DOCS_PROTOCOL, DOCS_TRUST } from '../../marketing/links.ts'
import { CodeBlock } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'

export function PasskeysPage() {
  return (
    <DocsPageShell
      to={DOCS_PASSKEYS}
      title="Passkeys."
      glyph={<IFingerprint size={28} />}
      lead={
        <>
          Sign in with Touch ID, Face ID, Windows Hello, your Android biometric, or a hardware
          security key — and skip typing your passphrase. Every passkey holds an encrypted copy of
          your private key; the passphrase stays as the recovery anchor underneath.
        </>
      }
    >
      <h2>What a passkey is here</h2>
      <p>In Vellaris a passkey serves two jobs at once:</p>
      <ol>
        <li>
          <strong>Authentication</strong> — proving to the server that this browser has a credential
          bound to your account, the same way passkeys work everywhere else.
        </li>
        <li>
          <strong>Key unwrap</strong> — the credential&rsquo;s built-in PRF extension produces a
          deterministic 32-byte secret per (passkey, eval-input) pair. Vellaris uses that secret as
          the AES key to wrap your RSA-4096 private key. The PRF output never leaves the
          authenticator hardware; the server stores only the opaque ciphertext.
        </li>
      </ol>
      <p>
        That second job is what makes passkeys an alternative to your passphrase — not just a login
        shortcut. After a passkey sign-in the SPA has the unwrapped private key in memory and can
        decrypt documents the same way a passphrase login does.
      </p>

      <h2>Adding one</h2>
      <p>
        Sign in with your passphrase first, then go to <Link to="/settings">Settings</Link> →
        Passkeys → <strong>Add a passkey</strong>. You&rsquo;ll see a name field (pick something
        you&rsquo;ll recognise — &ldquo;Work MacBook&rdquo;, &ldquo;YubiKey 5C&rdquo;) and the
        OS-native authenticator prompt. After verification the SPA wraps your private key under the
        new passkey&rsquo;s PRF output and pushes the ciphertext to the server.
      </p>
      <div className="docs-callout is-info">
        <span className="label">Add a second one</span>
        <span>
          The first time you add a passkey the dashboard nudges you to add a backup. A second
          passkey is the difference between &ldquo;lose this device, log in from another&rdquo; and
          &ldquo;forgot to back up, hope you remember the passphrase exactly&rdquo;.
        </span>
      </div>

      <h2>Signing in</h2>
      <p>
        On <code>/login</code>, browsers / devices with a discoverable user-verifying authenticator
        see a <strong>Sign in with a passkey</strong> button. Click it, complete the OS prompt, and
        you&rsquo;re in — no username field, no passphrase typing. Browsers without PRF (Firefox
        before 135, very old Touch ID) silently fall back to the passphrase form.
      </p>
      <p>
        On a brand new device the SPA needs the wrapped-key blob server-side before it can attempt a
        passkey login. The server returns it in the same <code>POST /webauthn/auth/finish</code>{' '}
        response that issues the session token, so the client can decrypt it under the PRF output
        that came back from the same <code>navigator.credentials.get()</code> call.
      </p>

      <h2>Losing all your passkeys</h2>
      <p>
        Passkeys never replace the passphrase — they sit on top of it. If you lose every registered
        authenticator (e.g., new laptop, no synced credentials), your passphrase still works:
      </p>
      <ol>
        <li>
          Sign in via <code>/login</code> using your username + passphrase. The server returns your
          passphrase-wrapped key blob (assuming you&rsquo;ve opted in to <em>Wrapped key sync</em>{' '}
          in Settings, or the blob is already on this device).
        </li>
        <li>The SPA derives the unwrap key with Argon2id and unwraps locally.</li>
        <li>Add a fresh passkey from Settings to skip the passphrase next time.</li>
      </ol>
      <p>
        If you&rsquo;ve also forgotten the passphrase, there&rsquo;s no recovery flow.{' '}
        <strong>This is intentional</strong> — see <Link to={DOCS_TRUST}>the trust model</Link> for
        why.
      </p>

      <h2>Sync, lifecycle, and quirks</h2>
      <ul>
        <li>
          <strong>iCloud Keychain / Google Password Manager / 1Password.</strong> Sync providers
          replicate the credential <em>and</em> its PRF surface across your devices, so one passkey
          works everywhere you&rsquo;re signed into the sync. The trade is documented in{' '}
          <Link to={DOCS_TRUST}>the trust model</Link>: a breach of the sync provider could derive
          the same PRF output and unwrap your private key.
        </li>
        <li>
          <strong>Hardware keys (YubiKey, Solo, etc.).</strong> Bound to the physical device; not
          synced. Pairs nicely with a sync-store passkey for redundancy.
        </li>
        <li>
          <strong>iOS Safari 16.4+.</strong> WebAuthn + PRF work on the home-screen-installed PWA;
          before iOS 17.3 the discoverable-credential flow could be flaky. We tested on 17.5.
        </li>
        <li>
          <strong>Removing a passkey.</strong> Settings → Passkeys → Remove just deletes the
          server-side row + the wrapped-key blob bound to it. The platform-side credential
          isn&rsquo;t touched (clean it up in your OS&rsquo;s passkey manager if you want).
        </li>
      </ul>

      <h2>Wire format</h2>
      <p>
        The full bytes-on-the-wire spec — including the AES-GCM-wrapped private key under the PRF
        output and the WebAuthn extension JSON — lives at{' '}
        <Link to={DOCS_PROTOCOL}>/docs/protocol</Link> under <em>Passkey-wrapped private key</em>.
        The four PRF endpoints (<code>register/begin</code>, <code>register/finish</code>,{' '}
        <code>auth/begin</code>, <code>auth/finish</code>) are listed in the OpenAPI playground.
      </p>

      <h2>Operator setup</h2>
      <p>
        Three env vars wire WebAuthn at the server; defaults work for <code>localhost</code> dev
        only:
      </p>
      <CodeBlock lang="shell">
        {`# The registrable domain WebAuthn binds credentials to. Production: vellaris.example.com (apex).
VELLARIS_WEBAUTHN_RP_ID=vellaris.example.com

# Human-readable name shown in the platform passkey prompt.
VELLARIS_WEBAUTHN_RP_NAME="Vellaris"

# Allowed origins for both register + authenticate ceremonies. Comma-separated or JSON list.
VELLARIS_WEBAUTHN_RP_ORIGINS=https://app.example.com,https://staging.example.com`}
      </CodeBlock>
      <div className="docs-callout is-warn">
        <span className="label">Don&rsquo;t change RP_ID after launch</span>
        <span>
          Browsers refuse to use a passkey on a different RP ID than the one it was registered
          under. Changing it breaks every existing passkey for every user. Pick the apex domain on
          day one and stick with it.
        </span>
      </div>
    </DocsPageShell>
  )
}

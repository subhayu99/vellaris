import { IShield } from '../../marketing/icons.tsx'
import { DOCS_PROTOCOL, DOCS_TRUST } from '../../marketing/links.ts'
import { CryptoCard } from '../crypto-card.tsx'
import { DefenseBadge } from '../defense-badge.tsx'
import { DocsPageShell } from '../page-shell.tsx'

export function TrustModelPage() {
  return (
    <DocsPageShell
      to={DOCS_TRUST}
      title="Trust model."
      glyph={<IShield size={28} />}
      lead={
        <>
          The honest version. What is protected, what is not, and what we punt on. An end-to-end
          encrypted product that doesn&rsquo;t tell you the limits of its threat model isn&rsquo;t
          trustworthy.
        </>
      }
    >
      <h2>Threat model</h2>
      <p>
        Vellaris assumes the <strong>server is curious</strong> but not actively malicious — it
        shouldn&rsquo;t need to be trusted with plaintext, but we don&rsquo;t try to defend against
        the operator splicing in their own builds. If you don&rsquo;t trust the operator, run your
        own.
      </p>

      <div className="docs-table-scroll">
      <table>
        <thead>
          <tr>
            <th>Adversary</th>
            <th>Defended?</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Server reading your file content</td>
            <td>
              <DefenseBadge kind="ok" />
            </td>
            <td>
              Ciphertext only on disk + on the wire. The server never holds a DEK in plaintext.
            </td>
          </tr>
          <tr>
            <td>Server reading filenames</td>
            <td>
              <DefenseBadge kind="ok" />
            </td>
            <td>Filenames are AES-encrypted under the per-document DEK.</td>
          </tr>
          <tr>
            <td>Server impersonating a user</td>
            <td>
              <DefenseBadge kind="ok" />
            </td>
            <td>
              Auth is challenge-response with the user&rsquo;s private key — server never sees
              passwords.
            </td>
          </tr>
          <tr>
            <td>Server tampering with audit log</td>
            <td>
              <DefenseBadge kind="ok" />
            </td>
            <td>
              Each entry Ed25519-signed. Tampering is detectable; deletion is not (forward-only).
            </td>
          </tr>
          <tr>
            <td>Network eavesdropper</td>
            <td>
              <DefenseBadge kind="ok">Defended (HTTPS)</DefenseBadge>
            </td>
            <td>The wire is base64-over-HTTPS. Run behind TLS in production.</td>
          </tr>
          <tr>
            <td>Active attacker swapping the SPA</td>
            <td>
              <DefenseBadge kind="no" />
            </td>
            <td>
              If the host serving <code>index.html</code> is compromised, you lose. SRI helps; pin a
              tarball.
            </td>
          </tr>
          <tr>
            <td>Stolen device with the wrapped key</td>
            <td>
              <DefenseBadge kind="partial" />
            </td>
            <td>The wrapped key is Argon2id-protected. A weak passphrase fails.</td>
          </tr>
          <tr>
            <td>Compromised browser session</td>
            <td>
              <DefenseBadge kind="no" />
            </td>
            <td>Anything that can run JS in the same origin can decrypt your files.</td>
          </tr>
          <tr>
            <td>Stolen passkey-bearing device</td>
            <td>
              <DefenseBadge kind="partial" />
            </td>
            <td>
              The PRF-wrapped key requires the original authenticator to decrypt. Lose the
              authenticator, lose the passkey&rsquo;s decryption ability — but the passphrase still
              works as the recovery anchor.
            </td>
          </tr>
          <tr>
            <td>Compromised passkey-sync provider</td>
            <td>
              <DefenseBadge kind="partial" />
            </td>
            <td>
              iCloud Keychain / Google Password Manager / 1Password sync passkeys across devices.
              A breach of the provider could let an attacker derive the same PRF output and unwrap
              your private key. Trust transferred from your local laptop password to your sync
              provider&rsquo;s security.
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <h2>What&rsquo;s NOT protected</h2>
      <ul>
        <li>
          <strong>Access-pattern metadata.</strong> The server sees who downloaded what, when, from
          which IP. Use Tor or a VPN if that matters.
        </li>
        <li>
          <strong>Revoked recipients who already downloaded.</strong> Revoke is forward-only. The
          server can&rsquo;t reach into bea&rsquo;s laptop.
        </li>
        <li>
          <strong>Forgotten passphrases.</strong> There is no recovery flow. This is a feature.
        </li>
        <li>
          <strong>Side-channel attacks.</strong> WebCrypto&rsquo;s RSA / AES are not constant-time
          on every platform. Don&rsquo;t run Vellaris alongside untrusted JS on the same origin.
        </li>
        <li>
          <strong>Forward secrecy of past content.</strong> A compromised RSA private key decrypts
          every DEK ever wrapped to that user. Key rotation lands in v2.
        </li>
      </ul>

      <h2>Cryptographic choices</h2>
      <div className="crypto-grid">
        <CryptoCard
          primitive="Symmetric AEAD"
          choice="AES-256-GCM · 12-byte nonce · 16-byte tag"
          why="NIST-recommended, hardware-accelerated everywhere."
        />
        <CryptoCard
          primitive="DEK wrapping"
          choice="RSA-4096 OAEP-SHA256 + MGF1(SHA-256)"
          why="Browsers and Python both ship this. ML-KEM 768 lands in v2."
        />
        <CryptoCard
          primitive="Auth challenge"
          choice="RSA-PSS-SHA256 · salt_length=32"
          why="Distinct padding from OAEP — sign/verify must NOT reuse the OAEP key handles."
        />
        <CryptoCard
          primitive="Passphrase KDF"
          choice="Argon2id · 256 MiB · 3 passes · 4 lanes"
          why="RFC 9106 + OWASP recommendation. ~1–2 s on Apple Silicon."
        />
        <CryptoCard
          primitive="Audit log signature"
          choice="Ed25519 · raw 32-byte keys"
          why="Server-side; the server signs every state-changing action."
        />
        <CryptoCard
          primitive="Wire envelope"
          choice="version ‖ nonce ‖ tag ‖ ciphertext"
          why="1-byte version prefix lets us swap schemes without breaking old data."
        />
      </div>

      <h2>On-wire formats</h2>
      <p>
        Every encrypted blob carries a 1-byte version prefix so we can swap schemes without breaking
        old data. See the <a href={DOCS_PROTOCOL}>on-wire protocol</a> for the byte-exact layouts.
      </p>

      <div className="docs-callout is-danger">
        <span className="label">Disclosure</span>
        <span>
          Security issues: please email <code>balasubhayu99@gmail.com</code> rather than filing a
          public issue. PGP key fingerprint will land here when v1.0 ships.
        </span>
      </div>
    </DocsPageShell>
  )
}

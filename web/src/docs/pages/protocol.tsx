import { IKey } from '../../marketing/icons.tsx'
import { DOCS_PROTOCOL } from '../../marketing/links.ts'
import { AuthFlow } from '../auth-flow.tsx'
import { CodeBlock, FieldList } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'

export function ProtocolPage() {
  return (
    <DocsPageShell
      to={DOCS_PROTOCOL}
      title="On-wire protocol."
      glyph={<IKey size={28} />}
      lead={
        <>
          Vellaris&rsquo;s wire formats are documented exactly so a client in any language can read
          what the Python CLI / SDK / web SPA write, and vice versa. The TS port at{' '}
          <code>web/src/crypto/</code> is the second implementation — its byte-level interop test (
          <code>web/tests/interop.test.ts</code>) is the reference cross-implementation check.
        </>
      }
    >
      <h2>Auth flow</h2>
      <p>
        A two-trip challenge-response. The server never sees a passphrase; the client never sees a
        token until it&rsquo;s proven possession of the private key. The diagram below is live —
        labels travel along each lifeline; reduced-motion shows them static.
      </p>
      <AuthFlow />
      <p style={{ marginTop: 14 }}>
        The bytes signed are exactly <code>challenge.id.bytes ‖ challenge.nonce</code>,{' '}
        <strong>not</strong> a JSON-encoded version. <code>challenge.id.bytes</code> is the raw
        16-byte big-endian UUID (as <code>uuid.UUID(s).bytes</code> returns it). Reference:{' '}
        <code>src/vellaris/server/routes/auth.py:_signed_blob</code>.
      </p>

      <h2>AES-GCM ciphertext envelope</h2>
      <CodeBlock lang="binary">
        {`┌─────────┬───────────┬─────────┬──────────────┐
│ version │  nonce    │   tag   │  ciphertext  │
│  1 byte │ 12 bytes  │ 16 bytes│   variable   │
└─────────┴───────────┴─────────┴──────────────┘`}
      </CodeBlock>
      <FieldList
        items={[
          {
            name: 'version',
            body: (
              <>
                <code>0x01</code> for AES-256-GCM with this layout. Reject anything else —
                don&rsquo;t guess.
              </>
            ),
          },
          {
            name: 'nonce',
            body: <>12 random bytes (AES-GCM standard, NIST SP 800-38D §8.2).</>,
          },
          { name: 'tag', body: <>16-byte authentication tag.</> },
          { name: 'ciphertext', body: <>Variable length.</> },
        ]}
      />
      <p>
        The tag is <strong>before</strong> the ciphertext, not appended. This lets a streaming
        reader verify the tag without buffering the whole blob. Vellaris doesn&rsquo;t stream in v1,
        but the layout is forward-friendly. Reference: <code>src/vellaris/core/wire.py</code>.
      </p>

      <h2>Wrapped private key</h2>
      <p>
        The user&rsquo;s RSA-4096 private key, encrypted with an Argon2id-derived key from their
        passphrase. The result is what&rsquo;s stored in{' '}
        <code>~/.vellaris/keys/&lt;user-id&gt;.key</code> and (opt-in) at{' '}
        <code>PUT /key-blobs/me</code>.
      </p>
      <CodeBlock lang="binary">
        {`┌─────────┬──────────┬──────────────┬──────────────┬──────────────────┐
│ version │   salt   │ params_len   │ params_json  │  inner ciphertext│
│  1 byte │ 16 bytes │   2 bytes BE │   variable   │   (envelope above)│
└─────────┴──────────┴──────────────┴──────────────┴──────────────────┘`}
      </CodeBlock>
      <FieldList
        items={[
          {
            name: 'version',
            body: (
              <>
                <code>0x01</code>.
              </>
            ),
          },
          { name: 'salt', body: <>16 random bytes for Argon2id.</> },
          {
            name: 'params_len',
            body: (
              <>
                <code>uint16</code>, big-endian.
              </>
            ),
          },
          {
            name: 'params_json',
            body: (
              <>
                The literal bytes of{' '}
                <code>
                  {
                    'json.dumps({"l":32,"m":262144,"p":4,"t":3}, sort_keys=True, separators=(",",":"))'
                  }
                </code>
                , i.e. <code>{'{"l":32,"m":262144,"p":4,"t":3}'}</code>. Keys are alphabetical (
                <code>l</code>, <code>m</code>, <code>p</code>, <code>t</code> → key length, memory
                cost in KiB, parallelism, time cost). Anything else makes the AAD check fail.
              </>
            ),
          },
          {
            name: 'inner ciphertext',
            body: (
              <>
                An AES-GCM envelope (above) whose plaintext is the unencrypted PKCS#8 PEM bytes. The
                encryption key comes from <code>Argon2id(passphrase, salt, params)</code>. The
                associated data (AAD) is <code>version || salt || params_json</code> — flipping any
                of those after wrap invalidates the tag.
              </>
            ),
          },
        ]}
      />
      <p>
        Reference: <code>src/vellaris/core/wrap.py</code>. Default Argon2id params match RFC 9106 /
        OWASP recommendations: 256 MiB · 3 passes · 4 lanes · 32-byte output.
      </p>

      <h2>Passkey-wrapped private key</h2>
      <p>
        When a user enrolls a passkey, the same RSA-4096 private key is also AES-GCM-wrapped under a
        32-byte secret returned by the WebAuthn PRF extension — no Argon2id needed. The PRF output
        is deterministic for a given (credential, eval input) pair, so the same passkey unwraps the
        same blob across logins.
      </p>
      <CodeBlock lang="binary">
        {`┌─────────┬──────────────────┐
│ version │ inner ciphertext │
│  1 byte │   (envelope)     │
└─────────┴──────────────────┘`}
      </CodeBlock>
      <FieldList
        items={[
          {
            name: 'version',
            body: (
              <>
                <code>0x02</code> for AES-256-GCM under a PRF-derived key. The version byte is bound
                to the AES-GCM AAD so a v2 blob can&rsquo;t be re-tagged as v1 (or vice-versa)
                without invalidating the tag.
              </>
            ),
          },
          {
            name: 'inner ciphertext',
            body: (
              <>
                Standard AES-GCM envelope (the same v1 wire format documented above). Plaintext is
                the PKCS#8 PEM-encoded RSA-4096 private key.
              </>
            ),
          },
        ]}
      />
      <p>
        The eval input the SPA hands the authenticator is a fixed 32-byte salt (SHA-256 of a domain
        separator string). Server stores the ciphertext only — it has no way to derive the unwrap
        key without the authenticator hardware. Reference: <code>web/src/crypto/wrap.ts</code> (
        {' '}
        <code>WRAPPED_V2_PRF</code>).
      </p>

      <h2>RSA usage</h2>
      <div className="docs-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Padding</th>
              <th>Hash</th>
              <th>Salt</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Encrypt the per-document AES key</td>
              <td>OAEP</td>
              <td>SHA-256 + MGF1(SHA-256)</td>
              <td>label = empty</td>
              <td>Wrapping the DEK per recipient.</td>
            </tr>
            <tr>
              <td>Sign the auth challenge</td>
              <td>PSS</td>
              <td>SHA-256 + MGF1(SHA-256)</td>
              <td>32 bytes</td>
              <td>
                <code>POST /auth/verify</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="docs-callout is-danger">
        <span className="label">Distinct key handles</span>
        <span>
          OAEP and PSS share the same modulus but must use{' '}
          <strong>distinct CryptoKey handles</strong> — different padding, different threat model.
          Re-using one across both is the bug the original PoC shipped with.
        </span>
      </div>
      <p>
        PEM serialization is unencrypted PKCS#8 for the private key,{' '}
        <code>SubjectPublicKeyInfo</code> for the public. The Vellaris reference writes 64-char body
        lines with <code>\n</code> separators (matching Python&rsquo;s <code>cryptography</code>{' '}
        default) so blobs round-trip byte-for-byte.
      </p>

      <h2>Document upload</h2>
      <p>
        <code>POST /documents</code> body:
      </p>
      <CodeBlock lang="json">
        {`{
  "encrypted_filename": "<base64 wire envelope of AES(filename, dek)>",
  "content_hash": "sha256:<64 hex of SHA-256(plaintext)>",
  "ciphertext": "<base64 wire envelope of AES(plaintext, dek)>",
  "access": [
    {"user_id": "<uuid>", "encrypted_dek": "<base64 RSA-OAEP(dek, public_key)>"},
    ...
  ]
}`}
      </CodeBlock>
      <p>
        The owner MUST be in <code>access</code> — the server enforces this. The DEK is a fresh 32
        random bytes per document, generated client-side. Reference:{' '}
        <code>src/vellaris/client/crypto.py:encrypt_for_recipients</code>.
      </p>

      <h2>Test vectors</h2>
      <p>
        <code>web/tests/fixtures/</code> ships six binary blobs produced by the Python reference (
        <code>web/tests/fixtures/generate.py</code> regenerates them). The TS port re-decodes them
        and asserts byte equality. If you&rsquo;re building a third client, run those same fixtures
        through your decoder — your suite should pass them.
      </p>
      <CodeBlock lang="shell">
        {`public_key.pem            RSA-4096 SPKI
wrapped_private_key.bin   passphrase = "vellaris-test-passphrase",
                          Argon2id m=64KiB · t=1 · p=1 (test-fast),
                          PKCS#8 PEM as plaintext
ciphertext.bin            AES-GCM(b"hello vellaris interop\\n", DEK = bytes(range(32)))
encrypted_dek.bin         RSA-OAEP(DEK, public_key)
pss_signature.bin         RSA-PSS(b"challenge-id-bytes-and-nonce", private_key)
meta.json                 the constants above, JSON-encoded`}
      </CodeBlock>
      <p>
        The full HTTP API is published as OpenAPI at <code>https://your-server/openapi.json</code>{' '}
        so you can codegen typed clients in any language.
      </p>

      <h2>Push notifications (v0.7+)</h2>
      <p>
        The PWA opts in to OS-level notifications via the standard Web Push protocol (
        <a href="https://datatracker.ietf.org/doc/html/rfc8030">RFC&nbsp;8030</a>) +{' '}
        <a href="https://datatracker.ietf.org/doc/html/rfc8292">VAPID&nbsp;(RFC&nbsp;8292)</a>.
        Subscriptions are stored server-side; the actual encrypted push goes from the server to the
        user&rsquo;s push service (FCM, Mozilla autopush, &hellip;) which forwards it to the
        browser&rsquo;s service worker.
      </p>
      <h3>Server keypair</h3>
      <p>
        The Vellaris server holds one P-256 keypair per deployment. Generate it once with the
        bundled CLI:
      </p>
      <CodeBlock lang="shell">
        {`vellaris-server generate-vapid-key > vapid.key
# wrote 32 bytes (raw P-256 private key) to stdout.
# Public key (base64url): BPI78kIu3wPiYmUKXjYpzVhtREGqpjdvAaZbpngeY-V_Vg_8…

# Then wire into Cloud Run / your container:
gcloud secrets create vellaris-vapid-key --data-file=vapid.key
# VELLARIS_VAPID_PRIVATE_KEY_PATH=/secrets/vapid.key
# VELLARIS_VAPID_SUBJECT=mailto:ops@example.com`}
      </CodeBlock>
      <p>
        The private key never leaves the server. The matching public key is derived from it at
        startup and served at <code>GET /notifications/public-key</code>; the SPA fetches it once
        per session and feeds it to <code>pushManager.subscribe()</code>.
      </p>

      <h3>Subscription registration</h3>
      <p>The SPA &harr; server handshake at subscribe time:</p>
      <CodeBlock lang="shell">
        {`POST /notifications/subscriptions
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint":      "https://fcm.googleapis.com/fcm/send/...",
  "p256dh_key":    "<base64 65-byte uncompressed P-256 public key>",
  "auth_secret":   "<base64 16-byte symmetric secret>",
  "user_agent":    "iPhone Safari" | null,
  "friendly_name": "iPhone" | null
}

→ 201 { id, endpoint, friendly_name, user_agent, created_at }`}
      </CodeBlock>
      <p>
        POST is idempotent on <code>endpoint</code>: the same browser re-subscribing (after a
        <code>pushsubscriptionchange</code> rotation) replaces the keys in place and returns the
        same row id. The server also exposes <code>GET /notifications/subscriptions</code> (per-user
        list, drives the Settings page) and{' '}
        <code>DELETE /notifications/subscriptions/{'{id}'}</code> (ownership-checked).
      </p>

      <h3>Payload shape (P2 model)</h3>
      <p>
        When the server sends a notification, it serialises this JSON, encrypts it with{' '}
        <code>pywebpush</code> against the subscription&rsquo;s{' '}
        <code>(p256dh_key, auth_secret)</code> pair, and dispatches it to the endpoint URL with a
        VAPID JWT in the Authorization header.
      </p>
      <CodeBlock lang="json">
        {`{
  "type":   "share" | "revoke",
  "from":   "<sender username>",
  "doc_id": "<uuid of the document>"
}`}
      </CodeBlock>
      <FieldList
        items={[
          {
            name: 'type',
            body: (
              <>
                Currently <code>share</code> or <code>revoke</code>; future events extend this enum.
              </>
            ),
          },
          {
            name: 'from',
            body: <>The sender&rsquo;s username, plain text. The push service learns this.</>,
          },
          {
            name: 'doc_id',
            body: (
              <>
                Used by the SW&rsquo;s <code>notificationclick</code> handler to navigate to
                <code>/dashboard?highlight=&lt;doc_id&gt;</code>. The id alone is uninformative — it
                can&rsquo;t be turned into the document&rsquo;s contents without the user&rsquo;s
                private key.
              </>
            ),
          },
        ]}
      />
      <p>
        Document <strong>titles never appear</strong> in the payload, since titles are client-side
        AES-GCM ciphertext bound to the per-document DEK. Surfacing them would require the unwrapped
        RSA key inside the SW context (a P3 model the project rejected — see the trust-model page
        for why). The push service correlation (your username + delivery time) is the cost of P2;
        users who don&rsquo;t want that exposure can leave Settings → Notifications disabled and
        Vellaris falls back to a no-notifications PWA.
      </p>

      <h3>Update strategy (U2 prompt-and-reload)</h3>
      <p>
        When a new SW is detected (different bytes from the installed one), the SPA shows a
        bottom-fixed banner:{' '}
        <em>&ldquo;Vellaris {'{version}'} is available. Reload to update.&rdquo;</em>
        Clicking Reload posts <code>SKIP_WAITING</code> to the waiting SW, which fires{' '}
        <code>controllerchange</code> and reloads the page on the new bundle. We chose visible
        prompts over silent updates because the SW is the SPA&rsquo;s fetch interceptor — silently
        swapping the build under the user&rsquo;s feet is the wrong default for a paranoid-by-design
        product.
      </p>
    </DocsPageShell>
  )
}

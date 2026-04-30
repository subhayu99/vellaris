import { IBraces } from '../../marketing/icons.tsx'
import { DOCS_SDK } from '../../marketing/links.ts'
import { CodeBlock } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'

export function SDKPage() {
  return (
    <DocsPageShell
      to={DOCS_SDK}
      title="Python SDK."
      glyph={<IBraces size={28} />}
      lead={
        <>
          <code>vellaris.client.Client</code> is the same code path the CLI uses, exposed as a
          library. There&rsquo;s an async version (<code>AsyncClient</code>) for FastAPI / Trio /
          asyncio handlers, and a sync wrapper for scripts.
        </>
      }
    >
      <CodeBlock lang="shell">{`pip install vellaris`}</CodeBlock>

      <h2>Quick example</h2>
      <CodeBlock lang="python">
        <div>
          <span className="tok-kw">from</span> vellaris.client{' '}
          <span className="tok-kw">import</span> Client
        </div>
        <div>&nbsp;</div>
        <div>
          c = Client(<span className="tok-str">"https://vault.example.com"</span>)
        </div>
        <div>
          c.<span className="tok-fn">login</span>(username=
          <span className="tok-str">"alice"</span>, passphrase=<span className="tok-str">"…"</span>)
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Upload, share, list, download.</span>
        </div>
        <div>
          doc = c.<span className="tok-fn">push</span>(path=
          <span className="tok-str">"report.pdf"</span>, recipients=[
          <span className="tok-str">"bea"</span>, <span className="tok-str">"cyrus"</span>])
        </div>
        <div>
          <span className="tok-fn">print</span>(doc.id)
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="tok-kw">for</span> d <span className="tok-kw">in</span> c.
          <span className="tok-fn">ls</span>(scope=<span className="tok-str">"mine"</span>):
        </div>
        <div>
          {'    '}
          <span className="tok-fn">print</span>(d.id, d.filename)
        </div>
        <div>&nbsp;</div>
        <div>
          c.<span className="tok-fn">pull</span>(doc_id=doc.id, out_dir=
          <span className="tok-str">"~/Downloads/"</span>)
        </div>
        <div>
          c.<span className="tok-fn">share</span>(doc_id=doc.id, username=
          <span className="tok-str">"dana"</span>)
        </div>
        <div>
          c.<span className="tok-fn">revoke</span>(doc_id=doc.id, username=
          <span className="tok-str">"bea"</span>)
        </div>
        <div>
          c.<span className="tok-fn">rm</span>(doc_id=doc.id)
        </div>
      </CodeBlock>

      <h2>Async flavor</h2>
      <CodeBlock lang="python">
        <div>
          <span className="tok-kw">import</span> asyncio
        </div>
        <div>
          <span className="tok-kw">from</span> vellaris.client{' '}
          <span className="tok-kw">import</span> AsyncClient
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="tok-kw">async def</span> <span className="tok-fn">main</span>():
        </div>
        <div>
          {'    '}
          <span className="tok-kw">async with</span> AsyncClient(
          <span className="tok-str">"https://vault.example.com"</span>){' '}
          <span className="tok-kw">as</span> c:
        </div>
        <div>
          {'        '}
          <span className="tok-kw">await</span> c.<span className="tok-fn">login</span>(username=
          <span className="tok-str">"alice"</span>, passphrase=
          <span className="tok-str">"…"</span>)
        </div>
        <div>
          {'        '}
          <span className="tok-kw">async for</span> d <span className="tok-kw">in</span> c.
          <span className="tok-fn">aiter_ls</span>(scope=
          <span className="tok-str">"all"</span>):
        </div>
        <div>
          {'            '}
          <span className="tok-fn">print</span>(d.id, d.filename)
        </div>
        <div>&nbsp;</div>
        <div>
          asyncio.<span className="tok-fn">run</span>(<span className="tok-fn">main</span>())
        </div>
      </CodeBlock>
      <p>
        <code>AsyncClient</code> is the source of truth — <code>Client</code> wraps it via{' '}
        <code>asyncio.run</code>.
      </p>

      <h2>Auth lifecycle</h2>
      <CodeBlock lang="python">
        {`# Signup runs the keygen + Argon2id wrap locally and POSTs the public key.
c.signup(username="alice", email="alice@example.com", passphrase="…")

# Login runs challenge-response. The bearer token is cached on the
# instance until logout / reconnect.
c.login(username="alice", passphrase="…")

me = c.whoami()
print(me.id, me.username)

c.logout()`}
      </CodeBlock>

      <h2>Working with bytes directly</h2>
      <p>For automations that don&rsquo;t want to round-trip through a temp file:</p>
      <CodeBlock lang="python">
        {`ciphertext_bundle = c.encrypt(
    plaintext=b"...",
    filename="report.pdf",
    recipients=["bea", "cyrus"],
)
# Send / store / inspect ciphertext_bundle yourself…

# Or: upload it.
doc = c.upload(ciphertext_bundle)`}
      </CodeBlock>
      <p>For decrypting a downloaded blob:</p>
      <CodeBlock lang="python">
        {`download = c.fetch(doc_id="…")     # returns DocumentDownload
decrypted = c.decrypt(download)    # returns DecryptedDocument(filename, plaintext)`}
      </CodeBlock>
      <p>
        These low-level helpers are the same primitives the CLI uses; see{' '}
        <code>vellaris/client/crypto.py</code> for the source of truth.
      </p>

      <h2>Custom transports</h2>
      <p>
        Pass <code>transport=</code> to drive the client against an in-process server in tests:
      </p>
      <CodeBlock lang="python">
        {`import httpx
from fastapi.testclient import TestClient
from vellaris.client import AsyncClient
from vellaris.server.app import create_app

async def test_round_trip():
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with AsyncClient("http://test", transport=transport) as c:
        # … real challenge / verify / push / pull …`}
      </CodeBlock>

      <h2>Errors</h2>
      <table>
        <thead>
          <tr>
            <th>Class</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>VellarisAPIError</code>
            </td>
            <td>
              Server returned 4xx / 5xx. <code>.status</code> and <code>.detail</code> set.
            </td>
          </tr>
          <tr>
            <td>
              <code>VellarisNetworkError</code>
            </td>
            <td>DNS / TLS / CORS / connection refused.</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.DecryptError</code>
            </td>
            <td>Wrong passphrase, tampered blob, AEAD tag mismatch.</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.SignatureError</code>
            </td>
            <td>PSS / Ed25519 verification failed.</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.KdfError</code>
            </td>
            <td>Argon2 params invalid (or below the safety floor).</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.WireFormatError</code>
            </td>
            <td>Blob is malformed / truncated / unknown version.</td>
          </tr>
        </tbody>
      </table>
      <p>Catch the broad ones in scripts:</p>
      <CodeBlock lang="python">
        {`from vellaris.core import VellarisCryptoError
from vellaris.client import VellarisAPIError, VellarisNetworkError

try:
    c.pull(doc_id, out_dir=...)
except VellarisAPIError as e:
    print(f"server said {e.status}: {e.detail}")
except VellarisCryptoError as e:
    print(f"crypto failed: {e}")
except VellarisNetworkError:
    print("server unreachable")`}
      </CodeBlock>
    </DocsPageShell>
  )
}

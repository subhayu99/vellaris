import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IBraces } from '../../marketing/icons.tsx'
import { DOCS_SDK } from '../../marketing/links.ts'
import { CodeBlock } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'
import { RecipePicker } from './sdk-builder/components/RecipePicker'
import { SdkConfigForm } from './sdk-builder/components/SdkConfigForm'
import { SnippetBox } from './install/components/SnippetBox'
import {
  decodeStateFromUrl,
  defaultSdkBuilderState,
  encodeStateToUrl,
  type SdkBuilderState,
} from './sdk-builder/state'
import { generateSdkSnippet } from './sdk-builder/templates'
import './sdk-builder/sdk-builder.css'

export function SDKPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = useState<SdkBuilderState>(() =>
    location.search ? decodeStateFromUrl(location.search) : defaultSdkBuilderState,
  )
  useEffect(() => {
    const newSearch = encodeStateToUrl(state)
    if (newSearch !== location.search) {
      navigate({ search: newSearch }, { replace: true })
    }
  }, [state, location.search, navigate])

  const snippet = useMemo(() => generateSdkSnippet(state), [state])

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
      <h2>Generate a starter snippet</h2>
      <p>
        Pick a recipe, fill in the args, copy the result. Bookmark the URL to share a configured
        snippet.
      </p>
      <RecipePicker value={state.recipe} onChange={(recipe) => setState((p) => ({ ...p, recipe }))} />
      <SdkConfigForm state={state} onChange={(patch) => setState((p) => ({ ...p, ...patch }))} />
      <SnippetBox title="Run this Python" contents={snippet} />

      <h2>Reference</h2>
      <CodeBlock lang="shell">{`pip install vellaris`}</CodeBlock>

      <h2>Quick example</h2>
      <CodeBlock lang="python">
        <div>
          <span className="tok-kw">from</span> pathlib <span className="tok-kw">import</span> Path
        </div>
        <div>
          <span className="tok-kw">from</span> uuid <span className="tok-kw">import</span> UUID
        </div>
        <div>
          <span className="tok-kw">from</span> vellaris.client{' '}
          <span className="tok-kw">import</span> Client
        </div>
        <div>&nbsp;</div>
        <div>
          c = Client(<span className="tok-str">"https://vault.example.com"</span>)
        </div>
        <div>
          c.<span className="tok-fn">login</span>(<span className="tok-str">"alice"</span>,{' '}
          <span className="tok-str">"…"</span>)
          <span className="tok-cmt">{'  '}# username, passphrase</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="tok-cmt"># Upload, share, list, download.</span>
        </div>
        <div>
          doc = c.<span className="tok-fn">push</span>(Path(
          <span className="tok-str">"report.pdf"</span>), share_with=[
          <span className="tok-str">"bea"</span>, <span className="tok-str">"cyrus"</span>])
        </div>
        <div>
          <span className="tok-fn">print</span>(doc[<span className="tok-str">"id"</span>])
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="tok-kw">for</span> d <span className="tok-kw">in</span> c.
          <span className="tok-fn">list_docs</span>(scope=
          <span className="tok-str">"mine"</span>):
        </div>
        <div>
          {'    '}
          <span className="tok-fn">print</span>(d[<span className="tok-str">"id"</span>], d[
          <span className="tok-str">"ciphertext_size"</span>])
        </div>
        <div>&nbsp;</div>
        <div>
          decrypted = c.<span className="tok-fn">pull</span>(UUID(doc[
          <span className="tok-str">"id"</span>]))
        </div>
        <div>
          Path(<span className="tok-str">"~/Downloads"</span>).
          <span className="tok-fn">expanduser</span>().<span className="tok-fn">joinpath</span>(
          decrypted.filename).<span className="tok-fn">write_bytes</span>(decrypted.plaintext)
        </div>
        <div>&nbsp;</div>
        <div>
          c.<span className="tok-fn">share_document</span>(UUID(doc[
          <span className="tok-str">"id"</span>]), <span className="tok-str">"dana"</span>)
        </div>
        <div>
          c.<span className="tok-fn">revoke_document</span>(UUID(doc[
          <span className="tok-str">"id"</span>]), <span className="tok-str">"bea"</span>)
        </div>
        <div>
          c.<span className="tok-fn">delete_document</span>(UUID(doc[
          <span className="tok-str">"id"</span>]))
        </div>
      </CodeBlock>
      <p>
        Returns from <code>push</code> / <code>list_docs</code> are server response{' '}
        <code>dict</code>s, not typed objects. <code>pull</code> returns a{' '}
        <code>DecryptedDocument(filename, plaintext)</code> dataclass.
      </p>

      <h2>Async flavor</h2>
      <CodeBlock lang="python">
        {`import asyncio
from vellaris.client import AsyncClient

async def main():
    async with AsyncClient("https://vault.example.com") as c:
        await c.login("alice", "…")
        for d in await c.list_docs(scope="all"):
            print(d["id"], d["ciphertext_size"])

asyncio.run(main())`}
      </CodeBlock>
      <p>
        <code>AsyncClient</code> is the source of truth — <code>Client</code> wraps it via{' '}
        <code>asyncio.run</code>. <code>list_docs</code> returns a list (not an async iterator).
      </p>

      <h2>Auth lifecycle</h2>
      <CodeBlock lang="python">
        {`# signup() generates the keypair, Argon2id-wraps it locally, writes
# the wrapped blob to ~/.vellaris/keys/<user-id>.key, and POSTs only
# the public key.
c.signup(username="alice", email="alice@example.com", passphrase="…")

# login() runs the challenge-response flow against the saved key and
# caches a session token on the Client instance.
c.login("alice", "…")

print(c.whoami())   # {"id": "...", "username": "alice", "email": "..."}

c.logout()`}
      </CodeBlock>

      <h2>Lower-level building blocks</h2>
      <p>
        The high-level <code>Client</code> covers signup / login / push / pull / share / list /
        revoke / delete. If you need bytes-in / bytes-out without touching the wrapped key store or
        the network, drop down to <code>vellaris.client.crypto</code>:
      </p>
      <CodeBlock lang="python">
        {`from vellaris.client.crypto import (
    encrypt_for_recipients, decrypt_bundle, Recipient,
)
from vellaris.core.asymmetric import deserialize_public_key

bundle = encrypt_for_recipients(
    plaintext=b"...",
    filename="report.pdf",
    recipients=[
        Recipient(user_id=alice_id, public_key=deserialize_public_key(alice_pem)),
        Recipient(user_id=bea_id,   public_key=deserialize_public_key(bea_pem)),
    ],
)
# bundle.encrypted_filename / bundle.content_hash / bundle.ciphertext / bundle.access
# are the four base64 fields POST /documents expects.`}
      </CodeBlock>
      <p>
        For wrapping / unwrapping the private key with a passphrase, see{' '}
        <code>vellaris.core.wrap.wrap_private_key</code> / <code>unwrap_private_key</code>.
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
              Server returned 4xx / 5xx. <code>.status_code</code> and <code>.detail</code> set.
            </td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.errors.VellarisCryptoError</code>
            </td>
            <td>Base class for the four crypto failures below.</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.errors.DecryptError</code>
            </td>
            <td>Wrong passphrase, tampered blob, AEAD tag mismatch.</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.errors.SignatureError</code>
            </td>
            <td>PSS / Ed25519 verification failed.</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.errors.KdfError</code>
            </td>
            <td>Argon2 params invalid (or below the safety floor).</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.errors.WireFormatError</code>
            </td>
            <td>Blob is malformed / truncated / unknown version.</td>
          </tr>
          <tr>
            <td>
              <code>vellaris.core.errors.KeyFormatError</code>
            </td>
            <td>PEM / PKCS#8 deserialization failed.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Network failures (DNS, TLS, connection refused) propagate as <code>httpx</code> exceptions —
        Vellaris doesn&rsquo;t wrap them. Catch <code>httpx.HTTPError</code> if you want to handle
        them specifically.
      </p>
      <p>Catch the broad ones in scripts:</p>
      <CodeBlock lang="python">
        {`import httpx
from vellaris.core.errors import VellarisCryptoError
from vellaris.client import VellarisAPIError

try:
    decrypted = c.pull(doc_id)
except VellarisAPIError as e:
    print(f"server said {e.status_code}: {e.detail}")
except VellarisCryptoError as e:
    print(f"crypto failed: {e}")
except httpx.HTTPError as e:
    print(f"network: {e}")`}
      </CodeBlock>
    </DocsPageShell>
  )
}

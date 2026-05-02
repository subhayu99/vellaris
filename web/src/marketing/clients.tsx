import { useState, type ReactNode } from 'react'
import { IBraces, ITerminal, IWindow } from './icons.tsx'

export function Clients() {
  return (
    <section className="section" id="clients">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">Three clients</div>
          <h2 className="h-section">Use it from the terminal, the browser, or your code.</h2>
          <p className="lead" style={{ maxWidth: 660 }}>
            Same crypto, same files, same trust boundary. Pick the client that fits the moment.
          </p>
        </div>

        <div className="clients-grid">
          <ClientCard
            icon={<ITerminal size={20} />}
            label="CLI"
            sub="Built for engineers. Pipe-able, scriptable, comfortable."
            snippet={<CLISnippet />}
            text={`vellaris push contract.pdf --to alice
# ↳ doc-9a4b21f8 · shared with alice

vellaris ls --shared-with-me
# ↳ doc-c1d37e90 audit-q1.zip from carol 2h
# ↳ doc-42afee1c notes.md     from ops   3d

vellaris share doc-9a4b21f8 --to carol
# ↳ wrapped DEK for carol

vellaris revoke doc-9a4b21f8 --from bob
# ↳ access revoked`}
          />
          <ClientCard
            icon={<IWindow size={20} />}
            label="Web"
            sub="For colleagues who don't live in the terminal. Deploy the static SPA to GitHub Pages or your own host — it talks to any Vellaris server."
            snippet={<WebMock />}
            noCopy
          />
          <ClientCard
            icon={<IBraces size={20} />}
            label="Python SDK"
            sub="For automations, ETLs, and webhook handlers."
            snippet={<SDKSnippet />}
            text={`from vellaris import Client

client = Client.login(
    "https://vault.team.dev",
    passphrase=...,
)
doc = client.push(
    Path("audit.pdf"),
    share_with=["alice", "bob"],
)
print(doc.fingerprint)`}
          />
        </div>
      </div>
    </section>
  )
}

interface ClientCardProps {
  icon: ReactNode
  label: string
  sub: string
  snippet: ReactNode
  text?: string
  noCopy?: boolean
}

function ClientCard({ icon, label, sub, snippet, text, noCopy }: ClientCardProps) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    if (noCopy || !text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  return (
    <div className="client-card">
      <div className="client-head">
        <div className="client-icon">{icon}</div>
        <div className="h-card">{label}</div>
        <p className="body-text" style={{ margin: 0, color: 'var(--fg-2)' }}>
          {sub}
        </p>
      </div>
      <div
        className={`client-snippet ${copied ? 'copied' : ''}`}
        onClick={onCopy}
        role={noCopy ? undefined : 'button'}
        title={noCopy ? undefined : 'Click to copy'}
      >
        {snippet}
        {!noCopy && <span className="copy-hint">{copied ? 'copied' : 'copy'}</span>}
      </div>
    </div>
  )
}

function CLISnippet() {
  return (
    <div>
      <div>
        <span style={{ color: 'var(--fg-4)' }}>$ </span>
        <span style={{ color: '#f3c777' }}>vellaris</span> push contract.pdf{' '}
        <span className="tok-flag">--to</span> alice
      </div>
      <div>
        <span className="tok-cmt"># ↳ doc-9a4b21f8 · shared with alice</span>
      </div>
      <div>&nbsp;</div>
      <div>
        <span style={{ color: 'var(--fg-4)' }}>$ </span>
        <span style={{ color: '#f3c777' }}>vellaris</span> ls{' '}
        <span className="tok-flag">--shared-with-me</span>
      </div>
      <div>
        <span className="tok-cmt"># ↳ doc-c1d37e90 audit-q1.zip from carol 2h</span>
      </div>
      <div>
        <span className="tok-cmt"># ↳ doc-42afee1c notes.md     from ops   3d</span>
      </div>
      <div>&nbsp;</div>
      <div>
        <span style={{ color: 'var(--fg-4)' }}>$ </span>
        <span style={{ color: '#f3c777' }}>vellaris</span> share doc-9a4b21f8{' '}
        <span className="tok-flag">--to</span> carol
      </div>
      <div>
        <span className="tok-cmt"># ↳ wrapped DEK for carol</span>
      </div>
      <div>&nbsp;</div>
      <div>
        <span style={{ color: 'var(--fg-4)' }}>$ </span>
        <span style={{ color: '#f3c777' }}>vellaris</span> revoke doc-9a4b21f8{' '}
        <span className="tok-flag">--from</span> bob
      </div>
      <div>
        <span className="tok-cmt"># ↳ access revoked</span>
      </div>
    </div>
  )
}

function SDKSnippet() {
  return (
    <div>
      <div>
        <span className="tok-kw">from</span> vellaris <span className="tok-kw">import</span> Client
      </div>
      <div>&nbsp;</div>
      <div>
        client = Client.<span className="tok-fn">login</span>(
      </div>
      <div>
        {'    '}
        <span className="tok-str">"https://vault.team.dev"</span>,
      </div>
      <div>{'    '}passphrase=...,</div>
      <div>)</div>
      <div>
        doc = client.<span className="tok-fn">push</span>(
      </div>
      <div>
        {'    '}Path(<span className="tok-str">"audit.pdf"</span>),
      </div>
      <div>
        {'    '}share_with=[<span className="tok-str">"alice"</span>,{' '}
        <span className="tok-str">"bob"</span>],
      </div>
      <div>)</div>
      <div>
        <span className="tok-fn">print</span>(doc.fingerprint)
      </div>
      <div>&nbsp;</div>
      <div>
        <span className="tok-cmt"># 9a:4b:21:f8:c0:e3:7d:91</span>
      </div>
    </div>
  )
}

function WebMock() {
  return (
    <div className="web-mock" style={{ whiteSpace: 'normal', cursor: 'default' }}>
      <div className="web-mock-bar">
        <span className="web-mock-dot" />
        <span className="web-mock-dot" />
        <span className="web-mock-dot" />
        <span
          style={{
            marginLeft: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--fg-3)',
          }}
        >
          vault.team-marchetti.dev
        </span>
      </div>
      <div className="web-mock-row">
        <div style={{ color: 'var(--gold-soft)' }}>◇</div>
        <div>
          <div className="name">Q4-board-pack.pdf</div>
          <div className="name-meta">shared with 3</div>
        </div>
        <div className="meta">
          <span className="encrypting-pill">
            <span className="mini-thread" /> encrypting
          </span>
        </div>
      </div>
      <div className="web-mock-row">
        <div style={{ color: 'var(--fg-3)' }}>◇</div>
        <div>
          <div className="name">audit-2026-q1.zip</div>
          <div className="name-meta">2.4 MB · sha256 7e1c…</div>
        </div>
        <div className="meta">2h ago</div>
      </div>
      <div className="web-mock-row">
        <div style={{ color: 'var(--fg-3)' }}>◇</div>
        <div>
          <div className="name">DPA-acme.pdf</div>
          <div className="name-meta">shared with 1</div>
        </div>
        <div className="meta">yesterday</div>
      </div>
      <div className="web-mock-row">
        <div style={{ color: 'var(--fg-3)' }}>◇</div>
        <div>
          <div className="name">redacted-customer-list.csv</div>
          <div className="name-meta">private</div>
        </div>
        <div className="meta">3 days</div>
      </div>
    </div>
  )
}

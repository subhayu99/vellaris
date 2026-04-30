import { useState } from 'react'
import { IGitHub } from './icons.tsx'
import { REPO_URL } from './links.ts'

export function GetStarted() {
  return (
    <section className="section" id="get-started">
      <div className="container">
        <div className="gs-grid">
          <div>
            <div className="eyebrow">Apache 2.0 · No CLA · No telemetry</div>
            <h2 className="h-section" style={{ marginTop: 12, marginBottom: 16 }}>
              Read every line.
            </h2>
            <p className="lead" style={{ maxWidth: 480 }}>
              Vellaris is open source. The crypto is in the open. The data model is in the open. The
              server is in the open. If anything here is wrong, you can prove it &mdash; and
              we&rsquo;ll fix it.
            </p>

            <div className="repo-meta" style={{ marginTop: 28, maxWidth: 480 }}>
              <div className="repo-meta-row">
                <span className="label">Repository</span>
                <span className="val" style={{ color: 'var(--gold-soft)' }}>
                  github.com/subhayu99/vellaris
                </span>
              </div>
              <div className="repo-meta-row">
                <span className="label">License</span>
                <span className="val">Apache-2.0</span>
              </div>
              <div className="repo-meta-row">
                <span className="label">Latest release</span>
                <span className="val">v0.4.0 · early</span>
              </div>
              <div className="repo-meta-row">
                <span className="label">Audited by</span>
                <span
                  className="val"
                  style={{
                    color: 'var(--fg-3)',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 13.5,
                  }}
                >
                  Pending external review · self-audit at /docs/security
                </span>
              </div>
              <a
                className="btn btn-secondary"
                style={{ alignSelf: 'flex-start' }}
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
              >
                <IGitHub size={16} /> Browse the source
              </a>
            </div>
          </div>

          <div className="install-cards">
            <InstallCard
              eyebrow="Install the client"
              command="pip install vellaris"
              sub="macOS · Linux · Windows. Python 3.10+."
            />
            <InstallCard
              eyebrow="Run a server"
              command="docker run -p 8000:8000 ghcr.io/subhayu99/vellaris:latest"
              sub="Or use docker-compose.yml for a Postgres-backed setup."
            />
            <InstallCard
              eyebrow="Use from TypeScript"
              command="pnpm add @vellaris/client"
              sub="Same trust boundary. Same on-wire format. Coming v1.5."
              dim
            />
          </div>
        </div>
      </div>
    </section>
  )
}

interface InstallCardProps {
  eyebrow: string
  command: string
  sub: string
  dim?: boolean
}

function InstallCard({ eyebrow, command, sub, dim }: InstallCardProps) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }
  return (
    <div className="install-card" style={dim ? { opacity: 0.7 } : {}}>
      <div className="eyebrow">{eyebrow}</div>
      <div className="cmd" onClick={onCopy} role="button" aria-label={`Copy: ${command}`}>
        <span>
          <span style={{ color: 'var(--fg-4)', marginRight: 8 }}>$</span>
          {command}
        </span>
        <span
          style={{
            fontSize: 11,
            color: copied ? 'var(--ok)' : 'var(--fg-4)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {copied ? 'copied' : 'copy'}
        </span>
      </div>
      <p className="sub">{sub}</p>
    </div>
  )
}

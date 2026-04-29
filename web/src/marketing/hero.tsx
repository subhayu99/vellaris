import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IArrowRight, IGitHub } from './icons.tsx'
import { useTypewriter, type TermLine } from './hooks.ts'
import { Terminal } from './terminal.tsx'
import { APP_ROUTE, REPO_URL } from './links.ts'

export function Hero() {
  const [installCopied, setInstallCopied] = useState(false)
  const onCopyInstall = async () => {
    try {
      await navigator.clipboard.writeText('pip install vellaris')
    } catch {
      /* clipboard API not available — silently no-op */
    }
    setInstallCopied(true)
    setTimeout(() => setInstallCopied(false), 1400)
  }
  const progress = useTypewriter(HERO_SCRIPT, { loopAfterMs: 5500 })
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow">Open-source · End-to-end encrypted · Self-hosted</div>
            <h1 className="h-hero">Files only the people you choose can read.</h1>
            <p className="lead">
              Vellaris is open-source, end-to-end encrypted document sharing you self-host. Your
              server stores ciphertext. Your laptop holds the keys. Your colleagues just get the
              file.
            </p>
            <div className="hero-cta-row">
              <Link className="btn btn-primary" to={APP_ROUTE}>
                Get Vellaris <IArrowRight size={16} />
              </Link>
              <a
                className="btn btn-secondary"
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
              >
                <IGitHub size={16} /> View on GitHub
              </a>
            </div>
            <button
              className={`hero-install ${installCopied ? 'copied' : ''}`}
              onClick={onCopyInstall}
              aria-label="Copy install command"
              type="button"
            >
              <span style={{ color: 'var(--fg-4)' }}>$</span>
              <span>pip install vellaris</span>
              <span className="copy-tag">{installCopied ? 'copied' : 'click to copy'}</span>
            </button>
          </div>

          <Terminal
            script={HERO_SCRIPT}
            progress={progress}
            label="~/work/marchetti — vellaris"
            ariaLabel="Vellaris CLI demo"
          />
        </div>
      </div>
    </section>
  )
}

const HERO_SCRIPT: ReadonlyArray<TermLine> = [
  { kind: 'cmd', text: 'pip install vellaris' },
  { kind: 'out', check: true, text: 'Installed vellaris 0.1.1', meta: '(client + cli)' },
  { kind: 'blank' },
  { kind: 'cmd', text: 'vellaris signup alice@example.com' },
  { kind: 'out', check: true, text: 'Generated keypair', meta: 'fingerprint 9a:4b:21:f8:c0:e3' },
  {
    kind: 'out',
    check: true,
    text: 'Encrypted private key with passphrase',
    meta: 'Argon2id · 256MB · 3 passes',
  },
  { kind: 'blank' },
  { kind: 'cmd', text: 'vellaris push contract.pdf --to bob' },
  { kind: 'encrypting', text: 'Encrypting on your device…', meta: 'AES-256-GCM' },
  { kind: 'out', check: true, text: 'Encrypted on your device', meta: '(372 KB → 372 KB)' },
  { kind: 'out', check: true, text: 'Uploaded ciphertext', meta: 'vault.team-marchetti.dev' },
  { kind: 'out', check: true, text: 'Shared with bob', meta: "RSA-OAEP via bob's pubkey" },
]

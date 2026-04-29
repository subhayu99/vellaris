import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IArrowRight, IGitHub } from './icons.tsx'
import { useTypewriter, type TermLine } from './hooks.ts'
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

          <HeroTerminal />
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

function HeroTerminal() {
  const progress = useTypewriter(HERO_SCRIPT, { loopAfterMs: 5500 })
  return (
    <div className="terminal" role="img" aria-label="Vellaris CLI demo">
      <div className="terminal-bar">
        <span className="terminal-dot" />
        <span className="terminal-dot" />
        <span className="terminal-dot" />
        <span className="label">~/work/marchetti — vellaris</span>
      </div>
      <div className="terminal-body">
        {HERO_SCRIPT.map((line, i) => (
          <TermLineView key={i} idx={i} line={line} progress={progress} />
        ))}
      </div>
    </div>
  )
}

interface TermLineViewProps {
  idx: number
  line: TermLine
  progress: { line: number; char: number; held: number }
}

function TermLineView({ idx, line, progress }: TermLineViewProps) {
  if (idx > progress.line) return null
  if (line.kind === 'blank') return <div className="term-line">&nbsp;</div>
  if (line.kind === 'cmd') {
    const fullText = line.text ?? ''
    const isCurrent = idx === progress.line
    const visible = isCurrent ? fullText.slice(0, progress.char) : fullText
    return (
      <div className="term-line">
        <span className="term-prompt">$ </span>
        <span className="term-cmd">{visible}</span>
        {isCurrent && progress.char < fullText.length && <span className="term-cursor" />}
      </div>
    )
  }
  if (line.kind === 'out') {
    const isCurrent = idx === progress.line
    const showCheck = !isCurrent || progress.held >= 2
    return (
      <div className="term-line term-out">
        {line.check ? (
          <span
            className="check"
            style={{ opacity: showCheck ? 1 : 0, transition: 'opacity 200ms ease' }}
          >
            ✓
          </span>
        ) : (
          <span style={{ display: 'inline-block', width: '1.4em' }} />
        )}
        <span>{line.text}</span>
        {line.meta && <span className="meta">  {line.meta}</span>}
      </div>
    )
  }
  if (line.kind === 'encrypting') {
    return (
      <div className="term-line term-encrypting">
        <span className="thread" aria-hidden="true" />
        <span style={{ color: 'var(--gold-soft)' }}>{line.text}</span>
        {line.meta && (
          <span style={{ color: 'rgba(247,241,227,0.45)' }}>· {line.meta}</span>
        )}
      </div>
    )
  }
  return null
}

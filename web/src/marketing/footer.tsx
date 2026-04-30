import { useState } from 'react'
import { Link } from 'react-router-dom'
import { VSigil } from '../components/v-sigil.tsx'
import { IMoon, ISun } from './icons.tsx'
import { DOCS_API, DOCS_QUICKSTART, DOCS_TRUST, DOCS_URL, REPO_URL } from './links.ts'
import type { ThemeName } from './hooks.ts'

interface FooterProps {
  theme: ThemeName
  onToggleTheme: () => void
}

export function Footer({ theme, onToggleTheme }: FooterProps) {
  const [buildCopied, setBuildCopied] = useState(false)
  const onCopyBuild = async () => {
    try {
      await navigator.clipboard.writeText('vellaris · v0.3.0')
    } catch {
      /* clipboard unavailable */
    }
    setBuildCopied(true)
    setTimeout(() => setBuildCopied(false), 1300)
  }
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="lockup">
              <VSigil size={26} />
              <span className="wordmark">vellaris</span>
            </div>
            <p>
              End-to-end encrypted document sharing you self-host. Open source under Apache 2.0.
            </p>
            <div style={{ marginTop: 8 }}>
              <button
                className="theme-toggle"
                onClick={onToggleTheme}
                aria-label="Toggle theme"
                type="button"
              >
                {theme === 'dark' ? <ISun size={14} /> : <IMoon size={14} />}
                {theme === 'dark' ? 'Light' : 'Dark'} mode
              </button>
            </div>
          </div>
          <div className="footer-col">
            <h4>Vellaris</h4>
            <ul>
              <li>
                <Link to={DOCS_URL}>Docs</Link>
              </li>
              <li>
                <Link to={DOCS_QUICKSTART}>Quickstart</Link>
              </li>
              <li>
                <Link to={DOCS_TRUST}>Trust model</Link>
              </li>
              <li>
                <a href={`${REPO_URL}/releases`} target="_blank" rel="noreferrer">
                  Changelog
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Develop</h4>
            <ul>
              <li>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </li>
              <li>
                <Link to={DOCS_API}>OpenAPI spec</Link>
              </li>
              <li>
                <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
                  Issue tracker
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Project</h4>
            <ul>
              <li>
                <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
                  About
                </a>
              </li>
              <li>
                <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                  License
                </a>
              </li>
              <li>
                <a
                  href={`${REPO_URL}/blob/main/README.md#acknowledgements`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Acknowledgements
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 vellaris contributors</span>
          <span style={{ fontSize: 11.5, opacity: 0.6 }}>
            No telemetry. No cookies set on this page.
          </span>
          <button
            className={`build ${buildCopied ? 'copied' : ''}`}
            onClick={onCopyBuild}
            type="button"
          >
            vellaris · v0.3.0
            {buildCopied && <span>✓</span>}
          </button>
        </div>
      </div>
    </footer>
  )
}

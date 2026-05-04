import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { VSigil } from '../components/v-sigil.tsx'
import { IClose, IGitHub, IMenu, IMoon, ISun } from './icons.tsx'
import type { ThemeName } from './hooks.ts'
import { APP_ROUTE, DOCS_TRUST, DOCS_URL, REPO_URL } from './links.ts'

interface NavBarProps {
  theme: ThemeName
  onToggleTheme: () => void
}

export function NavBar({ theme, onToggleTheme }: NavBarProps) {
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // Close the drawer on escape; also when an in-page anchor is tapped the
  // drawer auto-closes via the `onClick` on each link below.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const close = () => setOpen(false)
  return (
    <nav className={`nav ${stuck ? 'is-stuck' : ''}`} aria-label="Primary">
      <a className="nav-brand" href="#top">
        <VSigil size={26} />
        <span className="wordmark">vellaris</span>
      </a>
      <div className="nav-links">
        <span className="status-pill nav-hide-sm">
          <span className="dot" /> all systems normal
        </span>
        <a className="nav-link nav-hide-sm" href="#how">
          How it works
        </a>
        <a className="nav-link nav-hide-sm" href="#architecture">
          Architecture
        </a>
        <Link className="nav-link nav-hide-sm" to={DOCS_TRUST}>
          Trust
        </Link>
        <Link className="nav-link nav-hide-sm" to={DOCS_URL}>
          Docs
        </Link>
        <a
          className="nav-link nav-hide-sm"
          href={REPO_URL}
          aria-label="GitHub"
          target="_blank"
          rel="noreferrer"
        >
          <IGitHub size={16} />
          <span className="nav-hide-sm">GitHub</span>
        </a>
        <button
          type="button"
          className="nav-icon-btn nav-hide-sm"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <ISun size={16} /> : <IMoon size={16} />}
        </button>
        <Link className="btn btn-secondary btn-sm nav-hide-sm" to={APP_ROUTE}>
          Sign in
        </Link>
        <button
          type="button"
          className="nav-icon-btn nav-show-sm"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="marketing-mobile-menu"
        >
          {open ? <IClose size={18} /> : <IMenu size={18} />}
        </button>
      </div>

      <div
        id="marketing-mobile-menu"
        className={`nav-mobile-panel ${open ? 'is-open' : ''}`}
        role="menu"
        aria-hidden={!open}
      >
        <a className="nav-mobile-link" href="#how" onClick={close} role="menuitem">
          How it works
        </a>
        <a className="nav-mobile-link" href="#architecture" onClick={close} role="menuitem">
          Architecture
        </a>
        <Link className="nav-mobile-link" to={DOCS_TRUST} onClick={close} role="menuitem">
          Trust
        </Link>
        <Link className="nav-mobile-link" to={DOCS_URL} onClick={close} role="menuitem">
          Docs
        </Link>
        <a
          className="nav-mobile-link"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          onClick={close}
          role="menuitem"
        >
          <IGitHub size={14} /> GitHub
        </a>
        <div className="nav-mobile-row">
          <button
            type="button"
            className="nav-mobile-link"
            onClick={() => {
              onToggleTheme()
              close()
            }}
            role="menuitem"
          >
            {theme === 'dark' ? (
              <>
                <ISun size={14} /> Light mode
              </>
            ) : (
              <>
                <IMoon size={14} /> Dark mode
              </>
            )}
          </button>
          <Link className="btn btn-primary btn-sm" to={APP_ROUTE} onClick={close} role="menuitem">
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  )
}

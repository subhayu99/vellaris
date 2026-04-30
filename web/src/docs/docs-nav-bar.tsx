/* Docs-flavoured nav. Mirrors the marketing nav's chrome (sticky, blur,
 * status pill, theme toggle) but the section anchors target /docs
 * routes instead of #ids on the landing page. */

import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { VSigil } from '../components/v-sigil.tsx'
import { IGitHub, IMoon, ISun } from '../marketing/icons.tsx'
import type { ThemeName } from '../marketing/hooks.ts'
import { APP_ROUTE, DOCS_QUICKSTART, DOCS_TRUST, DOCS_URL, REPO_URL } from '../marketing/links.ts'

interface DocsNavBarProps {
  theme: ThemeName
  onToggleTheme: () => void
}

export function DocsNavBar({ theme, onToggleTheme }: DocsNavBarProps) {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <nav className={`nav ${stuck ? 'is-stuck' : ''}`} aria-label="Primary">
      <Link className="nav-brand" to="/">
        <VSigil size={26} />
        <span className="wordmark">vellaris</span>
      </Link>
      <div className="nav-links">
        <span className="status-pill nav-hide-sm">
          <span className="dot" /> docs · v0.4.1
        </span>
        <NavLink
          end
          className={({ isActive }) => `nav-link nav-hide-sm ${isActive ? 'is-active' : ''}`}
          to={DOCS_URL}
        >
          Docs
        </NavLink>
        <NavLink
          className={({ isActive }) => `nav-link nav-hide-sm ${isActive ? 'is-active' : ''}`}
          to={DOCS_QUICKSTART}
        >
          Quickstart
        </NavLink>
        <NavLink
          className={({ isActive }) => `nav-link nav-hide-sm ${isActive ? 'is-active' : ''}`}
          to={DOCS_TRUST}
        >
          Trust
        </NavLink>
        <a
          className="nav-link"
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
          className="nav-icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <ISun size={16} /> : <IMoon size={16} />}
        </button>
        <Link className="btn btn-secondary btn-sm" to={APP_ROUTE}>
          Sign in
        </Link>
      </div>
    </nav>
  )
}

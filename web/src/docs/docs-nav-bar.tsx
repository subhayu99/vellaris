/* Docs-flavoured nav. Mirrors the marketing nav's chrome (sticky, blur,
 * status pill, theme toggle) but the section anchors target /docs
 * routes instead of #ids on the landing page. */

import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { VSigil } from '../components/v-sigil.tsx'
import { IClose, IGitHub, IMenu, IMoon, ISun } from '../marketing/icons.tsx'
import type { ThemeName } from '../marketing/hooks.ts'
import { APP_ROUTE, DOCS_QUICKSTART, DOCS_TRUST, DOCS_URL, REPO_URL } from '../marketing/links.ts'

interface DocsNavBarProps {
  theme: ThemeName
  onToggleTheme: () => void
}

export function DocsNavBar({ theme, onToggleTheme }: DocsNavBarProps) {
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
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
          aria-controls="docs-mobile-menu"
        >
          {open ? <IClose size={18} /> : <IMenu size={18} />}
        </button>
      </div>

      <div
        id="docs-mobile-menu"
        className={`nav-mobile-panel ${open ? 'is-open' : ''}`}
        role="menu"
        aria-hidden={!open}
      >
        <NavLink
          end
          className="nav-mobile-link"
          to={DOCS_URL}
          onClick={close}
          role="menuitem"
        >
          Docs
        </NavLink>
        <NavLink
          className="nav-mobile-link"
          to={DOCS_QUICKSTART}
          onClick={close}
          role="menuitem"
        >
          Quickstart
        </NavLink>
        <NavLink
          className="nav-mobile-link"
          to={DOCS_TRUST}
          onClick={close}
          role="menuitem"
        >
          Trust
        </NavLink>
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
          <Link
            className="btn btn-primary btn-sm"
            to={APP_ROUTE}
            onClick={close}
            role="menuitem"
          >
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  )
}

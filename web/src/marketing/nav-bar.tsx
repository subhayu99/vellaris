import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { VSigil } from '../components/v-sigil.tsx'
import { IGitHub } from './icons.tsx'
import { APP_ROUTE, REPO_URL } from './links.ts'

export function NavBar() {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
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
        <a className="nav-link nav-hide-sm" href="#trust">
          Trust
        </a>
        <a className="nav-link" href={REPO_URL} aria-label="GitHub" target="_blank" rel="noreferrer">
          <IGitHub size={16} />
          <span className="nav-hide-sm">GitHub</span>
        </a>
        <Link className="btn btn-secondary btn-sm" to={APP_ROUTE}>
          Sign in
        </Link>
      </div>
    </nav>
  )
}

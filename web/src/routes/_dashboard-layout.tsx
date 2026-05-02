/**
 * Dashboard layout — sidebar + main pane.
 *
 * Used by /dashboard, /doc/:id, /settings. Persistent sidebar with the
 * V-sigil + wordmark up top, nav links in the middle, server URL +
 * current user + sign-out at the bottom. Top bar of the main pane has
 * a search trigger placeholder (the command palette lands later).
 *
 * On <md (mobile / narrow tablet) the sidebar collapses off-canvas behind
 * a hamburger toggle. The drawer animates in via translate-x and a
 * backdrop catches taps outside.
 *
 * Auth screens (/connect, /signup, /login) use AuthLayout instead.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import { VSigil } from '../components/v-sigil.tsx'
import { Wordmark } from '../components/wordmark.tsx'
import { Button } from '../components/button.tsx'
import {
  IClose,
  IFolder,
  IInbox,
  ILogOut,
  IMenu,
  ISearch,
  ISettings,
} from '../components/icons.tsx'
import { VellarisClient } from '../api/index.ts'
import { clearServerUrl, getServerUrl } from '../state/server.ts'
import { clearSessionAndKey, getCachedUser, getToken } from '../state/session.ts'
import { hasUnwrappedPem } from '../state/key-cache.ts'

export interface DashboardLayoutProps {
  children: ReactNode
  /** Optional element rendered in the top bar (right side). */
  topBarTrailing?: ReactNode
}

const NAV = [
  { to: '/dashboard?scope=shared', match: '/dashboard', label: 'Shared with me', icon: IInbox },
  { to: '/dashboard?scope=mine', match: '/dashboard', label: 'My files', icon: IFolder },
  { to: '/settings', match: '/settings', label: 'Settings', icon: ISettings },
] as const

export function DashboardLayout({ children, topBarTrailing }: DashboardLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  // Read once — getCachedUser() returns a fresh JSON.parse object per call,
  // and `user` in the useEffect deps below would otherwise re-fire forever.
  const serverUrl = useMemo(() => getServerUrl(), [])
  const user = useMemo(() => getCachedUser(), [])
  const token = useMemo(() => getToken(), [])

  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!serverUrl || !token || !user) {
      navigate('/connect', { replace: true })
    } else if (!hasUnwrappedPem()) {
      // Token is valid but the unwrapped key has been wiped (e.g. page reload).
      // Bounce to /login so the user re-enters their passphrase.
      navigate('/login', { replace: true })
    }
  }, [navigate, serverUrl, token, user])

  // Auto-close the drawer on every navigation so a tap on a nav link
  // doesn't leave the overlay open over the new route.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname, location.search])

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawerOpen])

  if (!serverUrl || !token || !user || !hasUnwrappedPem()) return null

  async function logout() {
    try {
      const client = new VellarisClient(serverUrl!, { token: token! })
      await client.logout()
    } catch {
      /* clear local state regardless */
    }
    clearSessionAndKey()
    clearServerUrl()
    navigate('/connect')
  }

  const display = serverUrl.replace(/^https?:\/\//, '')

  const sidebar = (
    <>
      <div className="flex items-center justify-between gap-2.5 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <VSigil size={26} />
          <Wordmark size="md" />
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="text-fg-3 hover:bg-line hover:text-fg flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors md:hidden"
        >
          <IClose size={18} />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-2">
        <div className="text-fg-3 px-2 py-1.5 text-[10.5px] font-medium tracking-[0.12em] uppercase">
          Workspace
        </div>
        {NAV.map((n) => {
          const Icon = n.icon
          return (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.match.replace(/\W/g, '-')}-${n.to.includes('mine') ? 'mine' : n.to.includes('shared') ? 'shared' : 'root'}`}
              className={({ isActive }) =>
                [
                  'focus-visible:outline-gold/60 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors focus-visible:outline-2',
                  isActive ? 'bg-line text-fg' : 'text-fg-2 hover:bg-line hover:text-fg',
                ].join(' ')
              }
            >
              <Icon size={15} />
              <span>{n.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="border-line mt-auto flex flex-col gap-2 border-t px-4 py-4">
        <div className="text-fg-3 flex items-center justify-between text-[11px] tracking-[0.12em] uppercase">
          <span>Server</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="sr-only">Connected</span>
            <span aria-hidden className="bg-ok inline-block h-1.5 w-1.5 rounded-full" />
          </span>
        </div>
        <div className="text-fg-2 font-mono text-[11.5px] break-all" title={serverUrl}>
          {display}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="min-w-0">
            <div className="text-fg truncate text-[12.5px]">{user.username}</div>
            <div className="text-fg-3 truncate font-mono text-[10.5px]">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            className="text-fg-3 hover:bg-line hover:text-fg flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors"
            data-testid="sidebar-logout"
          >
            <ILogOut size={16} />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="relative flex min-h-screen">
      {/* Persistent sidebar on md+ */}
      <aside className="border-line bg-bg-card/40 hidden w-60 flex-col border-r md:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer + backdrop */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        className={[
          'border-line bg-bg-card fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r transition-transform duration-200 ease-out md:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-hidden={!drawerOpen}
      >
        {sidebar}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-line flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="text-fg-2 hover:bg-line hover:text-fg flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md transition-colors md:hidden"
              data-testid="drawer-open"
            >
              <IMenu size={18} />
            </button>
            <button
              type="button"
              disabled
              aria-disabled
              title="Command palette lands in a follow-up"
              className="border-line-2 bg-bg-elev text-fg-3 hidden min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[13px] sm:inline-flex sm:max-w-md"
            >
              <ISearch size={14} />
              <span className="truncate">Search files, people, commands…</span>
              <span className="border-line-2 bg-bg-card text-fg-3 ml-auto rounded border px-1.5 py-px font-mono text-[10.5px]">
                ⌘K
              </span>
            </button>
            {/* Compact mobile-only search trigger */}
            <button
              type="button"
              disabled
              aria-disabled
              aria-label="Search (coming soon)"
              title="Command palette lands in a follow-up"
              className="text-fg-3 flex min-h-11 min-w-11 items-center justify-center rounded-md sm:hidden"
            >
              <ISearch size={18} />
            </button>
          </div>
          {topBarTrailing && <div className="shrink-0">{topBarTrailing}</div>}
        </header>
        <div className="flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
      </main>
    </div>
  )
}

export { Button }

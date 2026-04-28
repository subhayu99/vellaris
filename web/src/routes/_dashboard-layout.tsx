/**
 * Dashboard layout — sidebar + main pane.
 *
 * Used by /dashboard, /doc/:id, /settings. Persistent sidebar with the
 * V-sigil + wordmark up top, nav links in the middle, server URL +
 * current user + sign-out at the bottom. Top bar of the main pane has
 * a search trigger placeholder (the command palette lands later).
 *
 * Auth screens (/connect, /signup, /login) use AuthLayout instead.
 */

import { useEffect, useMemo, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { VSigil } from '../components/v-sigil.tsx'
import { Wordmark } from '../components/wordmark.tsx'
import { Button } from '../components/button.tsx'
import { IFolder, IInbox, ILogOut, ISearch, ISettings } from '../components/icons.tsx'
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
  // Read once — getCachedUser() returns a fresh JSON.parse object per call,
  // and `user` in the useEffect deps below would otherwise re-fire forever.
  const serverUrl = useMemo(() => getServerUrl(), [])
  const user = useMemo(() => getCachedUser(), [])
  const token = useMemo(() => getToken(), [])

  useEffect(() => {
    if (!serverUrl || !token || !user) {
      navigate('/connect', { replace: true })
    } else if (!hasUnwrappedPem()) {
      // Token is valid but the unwrapped key has been wiped (e.g. page reload).
      // Bounce to /login so the user re-enters their passphrase.
      navigate('/login', { replace: true })
    }
  }, [navigate, serverUrl, token, user])

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

  return (
    <div className="relative flex min-h-screen">
      <aside className="border-line bg-bg-card/40 flex w-60 flex-col border-r">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <VSigil size={26} />
          <Wordmark size="md" />
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
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors',
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
            <span aria-hidden className="bg-ok inline-block h-1.5 w-1.5 rounded-full" />
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
              className="text-fg-3 hover:bg-line hover:text-fg rounded-md p-1.5 transition-colors"
              data-testid="sidebar-logout"
            >
              <ILogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="border-line flex items-center justify-between gap-4 border-b px-6 py-4">
          <button
            type="button"
            disabled
            aria-disabled
            title="Command palette lands in a follow-up"
            className="border-line-2 bg-bg-elev text-fg-3 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[13px]"
          >
            <ISearch size={14} />
            <span>Search files, people, commands…</span>
            <span className="border-line-2 bg-bg-card text-fg-3 ml-2 rounded border px-1.5 py-px font-mono text-[10.5px]">
              ⌘K
            </span>
          </button>
          {topBarTrailing && <div>{topBarTrailing}</div>}
        </header>
        <div className="flex-1 px-6 py-6">{children}</div>
      </main>
    </div>
  )
}

export { Button }

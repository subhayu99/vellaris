/**
 * Home placeholder route — the post-login landing.
 *
 * The actual dashboard (file list, scope tabs, upload modal, etc.) lands
 * in a follow-up phase. For the foundation slice this just confirms the
 * full auth chain works: connection pill shows "Connected to <url> · <user>"
 * and a Logout action clears the bearer token.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, ConnectionPill, VSigil } from '../components/index.ts'
import { VellarisClient } from '../api/index.ts'
import { clearServerUrl, getServerUrl } from '../state/server.ts'
import { clearSession, getCachedUser, getToken } from '../state/session.ts'

export function HomeRoute() {
  const navigate = useNavigate()
  const serverUrl = getServerUrl()
  const user = getCachedUser()
  const token = getToken()

  useEffect(() => {
    if (!serverUrl || !token || !user) {
      navigate('/connect', { replace: true })
    }
  }, [navigate, serverUrl, token, user])

  if (!serverUrl || !token || !user) return null

  async function logout() {
    try {
      const client = new VellarisClient(serverUrl!, { token: token! })
      await client.logout()
    } catch {
      /* even if the server can't reach us, clear local state */
    }
    clearSession()
    navigate('/connect')
  }

  function disconnect() {
    clearSession()
    clearServerUrl()
    navigate('/connect')
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <a href="/" className="flex items-center gap-2.5">
          <VSigil size={26} />
          <span className="text-fg font-serif text-2xl tracking-tight italic">vellaris</span>
        </a>
        <div className="flex items-center gap-3">
          <ConnectionPill serverUrl={serverUrl} user={user.username} onDisconnect={disconnect} />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <VSigil size={56} glow />
          </div>
          <h1 className="text-fg font-serif text-3xl tracking-tight">
            Welcome, <span className="font-mono">{user.username}</span>
          </h1>
          <p className="text-fg-2 mt-3">
            Auth chain verified. The dashboard, upload modal, and document detail land in the next
            slice.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button variant="secondary" onClick={logout} data-testid="logout-button">
              Sign out
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

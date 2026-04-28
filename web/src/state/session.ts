/**
 * Session state — bearer token + current user identity.
 *
 * The token lives in `sessionStorage` so it doesn't survive a tab close
 * (a deliberate downgrade from Long-Lived sessions; refresh = re-login
 * is fine for the foundation slice). The current user's username is
 * cached alongside so the connection pill can render `… · alice`
 * without an extra `/users/me` round-trip on every page navigation.
 */

const TOKEN_KEY = 'vellaris.token'
const USER_KEY = 'vellaris.user'

export interface CachedUser {
  id: string
  username: string
  email: string
}

export function getToken(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? null
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  globalThis.sessionStorage?.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  globalThis.sessionStorage?.removeItem(TOKEN_KEY)
}

export function getCachedUser(): CachedUser | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CachedUser
  } catch {
    return null
  }
}

export function setCachedUser(user: CachedUser): void {
  globalThis.sessionStorage?.setItem(USER_KEY, JSON.stringify(user))
}

export function clearCachedUser(): void {
  globalThis.sessionStorage?.removeItem(USER_KEY)
}

/** Convenience: clear both token and user (logout). */
export function clearSession(): void {
  clearToken()
  clearCachedUser()
}

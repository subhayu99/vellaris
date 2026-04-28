/**
 * Session state — bearer token + current user identity.
 *
 * The token lives in `sessionStorage` so it doesn't survive a tab close
 * (a deliberate downgrade from Long-Lived sessions; refresh = re-login
 * is fine for the foundation slice). The current user's username is
 * cached alongside so the connection pill can render `… · alice`
 * without an extra `/users/me` round-trip on every page navigation.
 */

import { clearUnwrappedPem } from './key-cache.ts'

const TOKEN_KEY = 'vellaris.token'
const USER_KEY = 'vellaris.user'

export interface CachedUser {
  id: string
  username: string
  email: string
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* swallow */
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* swallow */
  }
}

export function getCachedUser(): CachedUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CachedUser
  } catch {
    return null
  }
}

export function setCachedUser(user: CachedUser): void {
  try {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* swallow */
  }
}

export function clearCachedUser(): void {
  try {
    sessionStorage.removeItem(USER_KEY)
  } catch {
    /* swallow */
  }
}

/** Convenience: clear both token and user (logout). */
export function clearSession(): void {
  clearToken()
  clearCachedUser()
}

/** Clear the session AND the in-memory unwrapped private-key cache. */
export function clearSessionAndKey(): void {
  clearSession()
  clearUnwrappedPem()
}

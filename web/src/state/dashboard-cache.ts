/**
 * "Last refreshed" timestamp for the dashboard list, persisted in
 * localStorage so the offline UI can show an honest staleness hint.
 *
 * The data itself is cached by the service worker via Workbox; this
 * module only stores the *time* the SPA last received a successful
 * `listDocuments()` response. Keyed by user id + scope so multi-account
 * setups don't bleed timestamps across each other.
 */
const KEY_PREFIX = 'vellaris.dashboard.last-refreshed.'

function key(userId: string, scope: string): string {
  return `${KEY_PREFIX}${userId}.${scope}`
}

export function rememberDashboardRefresh(userId: string, scope: string, when: Date = new Date()) {
  try {
    localStorage.setItem(key(userId, scope), when.toISOString())
  } catch {
    /* private browsing / quota — silently skip; the hint just won't show */
  }
}

export function readDashboardRefresh(userId: string, scope: string): Date | null {
  try {
    const raw = localStorage.getItem(key(userId, scope))
    if (!raw) return null
    const when = new Date(raw)
    return Number.isNaN(when.getTime()) ? null : when
  } catch {
    return null
  }
}

export function formatRelativeTime(when: Date, now: Date = new Date()): string {
  const ms = now.getTime() - when.getTime()
  if (ms < 60_000) return 'just now'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

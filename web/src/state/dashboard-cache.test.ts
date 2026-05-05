import { describe, expect, it } from 'vitest'

import {
  formatRelativeTime,
  readDashboardRefresh,
  rememberDashboardRefresh,
} from './dashboard-cache.ts'

const USER = 'u1'
const SCOPE = 'mine'

describe('dashboard-cache', () => {
  it('round-trips refresh timestamps per user/scope', () => {
    const when = new Date('2026-05-01T12:00:00Z')
    rememberDashboardRefresh(USER, SCOPE, when)
    const got = readDashboardRefresh(USER, SCOPE)
    expect(got?.toISOString()).toBe(when.toISOString())
  })

  it('returns null for missing entries', () => {
    expect(readDashboardRefresh(USER, SCOPE)).toBeNull()
  })

  it('keeps scope buckets independent', () => {
    rememberDashboardRefresh(USER, 'mine', new Date('2026-05-01T00:00:00Z'))
    rememberDashboardRefresh(USER, 'shared', new Date('2026-05-02T00:00:00Z'))
    expect(readDashboardRefresh(USER, 'mine')!.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(readDashboardRefresh(USER, 'shared')!.toISOString()).toBe('2026-05-02T00:00:00.000Z')
  })

  it('returns null for a corrupt timestamp', () => {
    localStorage.setItem(`vellaris.dashboard.last-refreshed.${USER}.${SCOPE}`, 'not-a-date')
    expect(readDashboardRefresh(USER, SCOPE)).toBeNull()
  })

  describe('formatRelativeTime', () => {
    const now = new Date('2026-05-06T12:00:00Z')

    it('rounds sub-minute differences to "just now"', () => {
      expect(formatRelativeTime(new Date(now.getTime() - 30_000), now)).toBe('just now')
    })

    it('reports minutes for under an hour', () => {
      expect(formatRelativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe('5 min ago')
    })

    it('reports hours for under a day', () => {
      expect(formatRelativeTime(new Date(now.getTime() - 3 * 60 * 60_000), now)).toBe('3 hr ago')
    })

    it('reports days for past 24h, with grammar', () => {
      expect(formatRelativeTime(new Date(now.getTime() - 24 * 60 * 60_000), now)).toBe('1 day ago')
      expect(formatRelativeTime(new Date(now.getTime() - 5 * 24 * 60 * 60_000), now)).toBe(
        '5 days ago',
      )
    })
  })
})

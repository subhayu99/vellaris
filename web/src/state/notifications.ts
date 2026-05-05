/**
 * Notification permission state machine for the soft-prompt + Settings UI.
 *
 * The browser exposes one global ``Notification.permission`` and one
 * ``pushManager.getSubscription()`` per origin. Combine those with the
 * iOS-specific install requirement (Safari only delivers push to PWAs
 * that have been added to the home screen) and you get six discrete
 * states the dashboard / settings need to react to.
 *
 * The soft-dismissal counter lets the N1 banner back off after a few
 * "not now"s — sessionStorage so a fresh sign-in resets it without
 * being too sticky.
 */

import { getCurrentSubscription, readPermission } from './push-subscription.ts'

export type PermissionState =
  | { kind: 'unsupported' }
  | { kind: 'ios-needs-install' }
  | { kind: 'default' }
  | { kind: 'denied' }
  | { kind: 'granted-not-subscribed' }
  | { kind: 'granted-subscribed' }

const SOFT_DISMISS_COUNT_KEY = 'vellaris.notifications.soft-dismiss-count'
const SOFT_DISMISS_AT_KEY = 'vellaris.notifications.soft-dismiss-at'
const SOFT_DISMISS_LIMIT = 3
const SOFT_DISMISS_BACKOFF_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

/**
 * Resolve the current permission/subscription state. Async because
 * pushManager.getSubscription() is itself async; cheap to call on
 * every render of the dashboard's notification-prompt component.
 */
export async function detectPermissionState(): Promise<PermissionState> {
  const snap = readPermission()
  if (!snap.supported) {
    // iOS Safari before adding to home screen lands here too — but we
    // can offer it the install hint, so distinguish that case.
    if (isIOS() && !snap.standalone) return { kind: 'ios-needs-install' }
    return { kind: 'unsupported' }
  }
  if (snap.permission === 'denied') return { kind: 'denied' }
  if (snap.permission === 'default') return { kind: 'default' }
  // permission === 'granted'
  try {
    const sub = await getCurrentSubscription()
    return sub ? { kind: 'granted-subscribed' } : { kind: 'granted-not-subscribed' }
  } catch {
    return { kind: 'granted-not-subscribed' }
  }
}

/** Bump the soft-dismissal counter + remember the moment we last asked. */
export function recordSoftDismissal(now: Date = new Date()): void {
  try {
    const current = softDismissalCount()
    sessionStorage.setItem(SOFT_DISMISS_COUNT_KEY, String(current + 1))
    sessionStorage.setItem(SOFT_DISMISS_AT_KEY, now.toISOString())
  } catch {
    /* private browsing — soft dismissal won't persist; banner returns next session */
  }
}

export function softDismissalCount(): number {
  try {
    const raw = sessionStorage.getItem(SOFT_DISMISS_COUNT_KEY)
    if (!raw) return 0
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

/**
 * True iff the soft prompt should be shown right now. Three "not now"s
 * in a session push the banner into a 7-day cooldown so the user
 * isn't badgered — the cooldown timestamp survives sessions because we
 * mirror it in localStorage.
 *
 * Both ``default`` and ``ios-needs-install`` count as "still askable"
 * states; ``denied`` / ``granted-*`` / ``unsupported`` never show the
 * soft banner. (``denied`` gets its own dedicated info notice in the
 * component; the others either don't need anything or are silently
 * resolved.)
 */
export function shouldShowSoftPrompt(state: PermissionState, now: Date = new Date()): boolean {
  if (state.kind !== 'default' && state.kind !== 'ios-needs-install') return false
  if (softDismissalCount() < SOFT_DISMISS_LIMIT) return true
  // Past the limit — check the persistent backoff window.
  try {
    const at = localStorage.getItem(SOFT_DISMISS_AT_KEY)
    if (!at) return true
    const last = Date.parse(at)
    if (!Number.isFinite(last)) return true
    return now.getTime() - last >= SOFT_DISMISS_BACKOFF_MS
  } catch {
    return true
  }
}

/** Records the same dismissal moment in localStorage so the 7-day backoff survives sessions. */
export function recordHardDismissal(now: Date = new Date()): void {
  try {
    localStorage.setItem(SOFT_DISMISS_AT_KEY, now.toISOString())
  } catch {
    /* swallow */
  }
}

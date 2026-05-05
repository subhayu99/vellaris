/**
 * Push-subscription orchestration — sit between the browser's
 * pushManager API and the Vellaris server's `/notifications` routes.
 *
 *   subscribeToPush(client)   — request permission (caller's job to do
 *     so first), call pushManager.subscribe with the server's VAPID
 *     public key, POST the resulting endpoint + keys to the server,
 *     and stash the server-assigned subscription id locally so we can
 *     find it again at unsubscribe time.
 *
 *   unsubscribeFromPush(client) — read the stashed id, DELETE the
 *     server-side row, then unsubscribe the local pushManager.
 *
 *   getCurrentSubscription() — peek at the local pushManager state
 *     without changing anything; Settings uses this to render an
 *     accurate "subscribed/not subscribed" badge.
 *
 * The actual encrypted push goes server → push-service → SW; this
 * module only manages the registration handshake.
 */

import { base64ToBytes, type VellarisClient } from '../api/index.ts'
import type { PushSubscriptionRecord } from '../api/index.ts'

const SUB_ID_KEY = 'vellaris.push-subscription-id'

export interface PermissionSnapshot {
  /** True iff the browser has the SW + PushManager + Notification APIs. */
  supported: boolean
  /** Whatever Notification.permission currently reports. */
  permission: 'default' | 'granted' | 'denied'
  /** True if the SPA is launched standalone (relevant for iOS). */
  standalone: boolean
}

export function readPermission(): PermissionSnapshot {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'default', standalone: false }
  }
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
  const permission =
    typeof Notification === 'undefined'
      ? 'default'
      : (Notification.permission as PermissionSnapshot['permission'])
  const matchStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const navStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return {
    supported,
    permission,
    standalone: matchStandalone || navStandalone,
  }
}

/** Decode the base64url public key the server returned and feed it to subscribe(). */
function decodeVapidKey(b64url: string): ArrayBuffer {
  // Pad + translate URL-safe chars → standard base64 so base64ToBytes works.
  const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4))
  const normal = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bytes = base64ToBytes(normal)
  // pushManager.subscribe insists on an ArrayBuffer-backed BufferSource;
  // the typed array returned by base64ToBytes can be backed by either,
  // so copy into a fresh ArrayBuffer to make TS + browsers happy.
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function dataViewToBytes(buffer: ArrayBuffer | null): Uint8Array {
  if (!buffer) throw new Error('subscription is missing required key bytes')
  return new Uint8Array(buffer)
}

function detectFriendlyName(): string | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Linux/.test(ua)) return 'Linux'
  return null
}

function rememberSubscriptionId(id: string): void {
  try {
    localStorage.setItem(SUB_ID_KEY, id)
  } catch {
    /* private browsing — unsubscribe will fall back to listing all and matching */
  }
}

function readSubscriptionId(): string | null {
  try {
    return localStorage.getItem(SUB_ID_KEY)
  } catch {
    return null
  }
}

function forgetSubscriptionId(): void {
  try {
    localStorage.removeItem(SUB_ID_KEY)
  } catch {
    /* swallow */
  }
}

/** Return the SW's current PushSubscription, or null if not subscribed. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/**
 * Subscribe the current browser to push notifications + register with
 * the Vellaris server. Caller is responsible for calling
 * `Notification.requestPermission()` first if needed; this function
 * raises if permission isn't granted by the time it's invoked.
 */
export async function subscribeToPush(client: VellarisClient): Promise<PushSubscriptionRecord> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('this browser does not support push notifications')
  }
  if (Notification.permission !== 'granted') {
    throw new Error('notification permission is required before subscribing')
  }

  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await client.getPushPublicKey()

  // Some browsers reuse a previous subscription if you call subscribe()
  // with an unchanged applicationServerKey — that's fine. If a subscription
  // exists with a *different* key we drop it first so the server gets the
  // matching pair.
  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    await existing.unsubscribe()
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(publicKey),
  })

  const record = await client.registerPushSubscription({
    endpoint: sub.endpoint,
    p256dhKey: dataViewToBytes(sub.getKey('p256dh')),
    authSecret: dataViewToBytes(sub.getKey('auth')),
    userAgent: navigator.userAgent,
    friendlyName: detectFriendlyName(),
  })
  rememberSubscriptionId(record.id)
  return record
}

/**
 * Remove the local subscription + the matching server-side row.
 *
 * The server-assigned id is stashed in localStorage at subscribe time;
 * on unsubscribe we read it and call DELETE. If localStorage doesn't
 * have an id (private browsing, manual reset), we list the user's
 * devices and — if exactly one is registered — delete that one. Any
 * other case leaves the server-side rows alone (the user can clean
 * them up manually in Settings).
 */
export async function unsubscribeFromPush(client: VellarisClient): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()

  const cachedId = readSubscriptionId()
  if (cachedId) {
    try {
      await client.deletePushSubscription(cachedId)
    } catch {
      // Row may already be gone (server-side cleanup, manual delete).
      // Keep going; we still want the local unsubscribe to run.
    }
    forgetSubscriptionId()
  } else {
    try {
      const list = await client.listPushSubscriptions()
      if (list.length === 1) {
        await client.deletePushSubscription(list[0]!.id)
      }
    } catch {
      /* server unreachable — local unsubscribe still runs */
    }
  }

  if (sub) {
    await sub.unsubscribe()
  }
}

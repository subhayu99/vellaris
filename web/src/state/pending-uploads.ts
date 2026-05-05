/**
 * Pending-uploads tracker — localStorage-backed list of uploads that
 * couldn't reach the server when the user submitted them.
 *
 * The actual ciphertext lives in the service worker's BackgroundSync
 * queue (IndexedDB-backed by Workbox); this module only stores the
 * metadata we need to render a "Pending — will upload when online"
 * placeholder row in the dashboard. Filename / size / hash are all
 * derived from the local file before encryption, so writing them to
 * localStorage doesn't leak anything the user wouldn't see anyway.
 *
 * Keyed by user id so multi-account browsers don't cross-contaminate.
 * On reconnect the SPA listens for `sync-done` from the SW and shifts
 * the oldest entry off the queue, then refetches the dashboard list.
 */

const KEY_PREFIX = 'vellaris.pending-uploads.'

export interface PendingUpload {
  /** Stable client-generated id; survives across reloads. */
  id: string
  filename: string
  size: number
  /** Hex sha256 of the plaintext (post-encryption metadata). */
  contentHash: string
  /** Usernames of the recipients selected by the user, for display. */
  recipientUsernames: string[]
  /** ISO timestamp; the dashboard renders a relative "queued N min ago". */
  queuedAt: string
}

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

function readRaw(userId: string): PendingUpload[] {
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PendingUpload[]) : []
  } catch {
    return []
  }
}

function writeRaw(userId: string, list: PendingUpload[]): void {
  try {
    if (list.length === 0) {
      localStorage.removeItem(key(userId))
      return
    }
    localStorage.setItem(key(userId), JSON.stringify(list))
  } catch {
    /* private browsing / quota — pending row just won't persist across reloads */
  }
}

export function listPendingUploads(userId: string): PendingUpload[] {
  return readRaw(userId)
}

export function addPendingUpload(
  userId: string,
  pending: Omit<PendingUpload, 'id' | 'queuedAt'>,
): PendingUpload {
  const entry: PendingUpload = {
    ...pending,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  }
  const list = readRaw(userId)
  list.push(entry)
  writeRaw(userId, list)
  return entry
}

/**
 * Remove the oldest pending upload — called after the SW reports a
 * `sync-done` for `POST /documents`. The queue replays in FIFO order, so
 * shifting the oldest entry matches the order Workbox replays.
 */
export function shiftPendingUpload(userId: string): PendingUpload | null {
  const list = readRaw(userId)
  if (list.length === 0) return null
  const [first, ...rest] = list
  writeRaw(userId, rest)
  return first ?? null
}

export function clearPendingUploads(userId: string): void {
  writeRaw(userId, [])
}

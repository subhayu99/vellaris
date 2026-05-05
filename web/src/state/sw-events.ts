/**
 * SPA-side subscription to the service worker's broadcast channel.
 *
 * The SW posts `sync-done` / `sync-failed` after replaying a queued
 * mutation (see src/sw/push-handler.ts). Components subscribe via
 * `onSyncEvent(callback)`; multiple subscribers can coexist, and the
 * unsubscribe return value lets each component clean up on unmount.
 *
 * This module is the only place that registers a `message` listener on
 * the SW container — having every component register its own would
 * leak listeners and complicate teardown.
 */

export interface SyncEventMessage {
  type: 'sync-done' | 'sync-failed'
  url: string
  method: string
  status: number
}

type Listener = (message: SyncEventMessage) => void

const listeners = new Set<Listener>()
let installed = false

function dispatch(event: MessageEvent): void {
  const data = event.data as { type?: string } | undefined
  if (!data) return
  if (data.type !== 'sync-done' && data.type !== 'sync-failed') return
  const message = data as SyncEventMessage
  for (const listener of listeners) {
    try {
      listener(message)
    } catch (err) {
      // A throwing listener shouldn't take the others down with it.
      console.warn('sw-event listener threw', err)
    }
  }
}

function install(): void {
  if (installed) return
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
  navigator.serviceWorker.addEventListener('message', dispatch)
  installed = true
}

export function onSyncEvent(listener: Listener): () => void {
  install()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

import { describe, expect, it } from 'vitest'

import {
  addPendingUpload,
  clearPendingUploads,
  listPendingUploads,
  shiftPendingUpload,
} from './pending-uploads.ts'

const USER = '00000000-0000-0000-0000-000000000001'

const baseEntry = {
  filename: 'plan.txt',
  size: 256,
  contentHash: 'sha256:deadbeef',
  recipientUsernames: ['alice'],
}

describe('pending-uploads', () => {
  it('round-trips a single entry', () => {
    const created = addPendingUpload(USER, baseEntry)
    expect(created.id).toMatch(/[0-9a-f-]{36}/)
    expect(created.queuedAt).toBeTruthy()

    const list = listPendingUploads(USER)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject(baseEntry)
  })

  it('shifts in FIFO order — oldest first', () => {
    const first = addPendingUpload(USER, { ...baseEntry, filename: 'first.txt' })
    const second = addPendingUpload(USER, { ...baseEntry, filename: 'second.txt' })

    const popped = shiftPendingUpload(USER)
    expect(popped?.id).toBe(first.id)
    expect(listPendingUploads(USER).map((p) => p.id)).toEqual([second.id])
  })

  it('returns null when shifting from an empty list', () => {
    expect(shiftPendingUpload(USER)).toBeNull()
  })

  it('keeps lists per-user', () => {
    const other = '00000000-0000-0000-0000-000000000002'
    addPendingUpload(USER, baseEntry)
    addPendingUpload(other, { ...baseEntry, filename: 'other.txt' })
    expect(listPendingUploads(USER)).toHaveLength(1)
    expect(listPendingUploads(other)).toHaveLength(1)
    expect(listPendingUploads(USER)[0]?.filename).toBe('plan.txt')
    expect(listPendingUploads(other)[0]?.filename).toBe('other.txt')
  })

  it('clears all pending entries', () => {
    addPendingUpload(USER, baseEntry)
    addPendingUpload(USER, baseEntry)
    clearPendingUploads(USER)
    expect(listPendingUploads(USER)).toEqual([])
  })

  it('survives malformed localStorage payloads', () => {
    localStorage.setItem(`vellaris.pending-uploads.${USER}`, '{not valid json')
    expect(listPendingUploads(USER)).toEqual([])
  })
})

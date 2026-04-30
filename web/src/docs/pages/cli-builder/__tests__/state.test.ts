import { describe, expect, it } from 'vitest'
import {
  decodeStateFromUrl,
  encodeStateToUrl,
  defaultCliBuilderState,
  type CliBuilderState,
} from '../state'

describe('cli builder state codec', () => {
  it('round-trips default state to a clean URL', () => {
    const url = encodeStateToUrl(defaultCliBuilderState)
    const decoded = decodeStateFromUrl(url)
    expect(decoded).toEqual(defaultCliBuilderState)
  })

  it('round-trips a custom push state with file path and share-with', () => {
    const state: CliBuilderState = {
      ...defaultCliBuilderState,
      command: 'push',
      filePath: 'report.pdf',
      shareWith: 'bob,carol',
    }
    const url = encodeStateToUrl(state)
    expect(url).toContain('f=report.pdf')
    expect(url).toContain('sw=bob%2Ccarol')
    const decoded = decodeStateFromUrl(url)
    expect(decoded.command).toBe('push')
    expect(decoded.filePath).toBe('report.pdf')
    expect(decoded.shareWith).toBe('bob,carol')
  })

  it('falls back to default command on garbage command string', () => {
    const decoded = decodeStateFromUrl('?cmd=teleport')
    expect(decoded.command).toBe(defaultCliBuilderState.command)
  })

  it('falls back to default scope on garbage scope value', () => {
    const decoded = decodeStateFromUrl('?sc=everything')
    expect(decoded.scope).toBe(defaultCliBuilderState.scope)
  })

  it('decodes a valid non-default command', () => {
    const decoded = decodeStateFromUrl('?cmd=signup&u=charlie&s=https%3A%2F%2Fvault.co')
    expect(decoded.command).toBe('signup')
    expect(decoded.username).toBe('charlie')
    expect(decoded.serverUrl).toBe('https://vault.co')
  })

  it('omits default fields from URL to keep it compact', () => {
    const url = encodeStateToUrl(defaultCliBuilderState)
    const params = new URLSearchParams(url.startsWith('?') ? url.slice(1) : url)
    expect(Array.from(params.keys()).length).toBe(0)
  })

  it('round-trips a key-export state', () => {
    const state: CliBuilderState = {
      ...defaultCliBuilderState,
      command: 'key-export',
      keyExportPath: '/home/alice/backup.bin',
    }
    const url = encodeStateToUrl(state)
    const decoded = decodeStateFromUrl(url)
    expect(decoded.command).toBe('key-export')
    expect(decoded.keyExportPath).toBe('/home/alice/backup.bin')
  })

  it('decodes all valid scope values', () => {
    for (const scope of ['all', 'mine', 'shared'] as const) {
      const decoded = decodeStateFromUrl(`?sc=${scope}`)
      expect(decoded.scope).toBe(scope)
    }
  })
})

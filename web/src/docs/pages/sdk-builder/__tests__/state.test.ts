import { describe, expect, it } from 'vitest'
import {
  decodeStateFromUrl,
  encodeStateToUrl,
  defaultSdkBuilderState,
  type SdkBuilderState,
} from '../state'

describe('sdk builder state codec', () => {
  it('round-trips default state to a clean URL', () => {
    const url = encodeStateToUrl(defaultSdkBuilderState)
    const decoded = decodeStateFromUrl(url)
    expect(decoded).toEqual(defaultSdkBuilderState)
  })

  it('round-trips a custom download state with sync variant and custom server URL', () => {
    const state: SdkBuilderState = {
      ...defaultSdkBuilderState,
      recipe: 'download',
      variant: 'sync',
      serverUrl: 'https://my-vault.example.com',
      documentId: 'abc-123',
    }
    const url = encodeStateToUrl(state)
    expect(url).toContain('r=download')
    expect(url).toContain('v=sync')
    expect(url).toContain('s=https')
    const decoded = decodeStateFromUrl(url)
    expect(decoded.recipe).toBe('download')
    expect(decoded.variant).toBe('sync')
    expect(decoded.serverUrl).toBe('https://my-vault.example.com')
    expect(decoded.documentId).toBe('abc-123')
  })

  it('falls back to default recipe on garbage recipe string', () => {
    const decoded = decodeStateFromUrl('?r=teleport')
    expect(decoded.recipe).toBe(defaultSdkBuilderState.recipe)
  })

  it('falls back to default variant on garbage variant value', () => {
    const decoded = decodeStateFromUrl('?v=threaded')
    expect(decoded.variant).toBe(defaultSdkBuilderState.variant)
  })

  it('omits default fields from URL to keep it compact', () => {
    const url = encodeStateToUrl(defaultSdkBuilderState)
    const params = new URLSearchParams(url.startsWith('?') ? url.slice(1) : url)
    expect(Array.from(params.keys()).length).toBe(0)
  })

  it('decodes a valid non-default recipe', () => {
    const decoded = decodeStateFromUrl('?r=share&u=charlie&to=dana')
    expect(decoded.recipe).toBe('share')
    expect(decoded.username).toBe('charlie')
    expect(decoded.recipient).toBe('dana')
  })

  it('decodes all valid recipe values', () => {
    for (const recipe of [
      'upload',
      'upload-and-share',
      'download',
      'list',
      'share',
      'revoke',
    ] as const) {
      const decoded = decodeStateFromUrl(`?r=${recipe}`)
      expect(decoded.recipe).toBe(recipe)
    }
  })

  it('decodes all valid variant values', () => {
    for (const variant of ['async', 'sync'] as const) {
      const decoded = decodeStateFromUrl(`?v=${variant}`)
      expect(decoded.variant).toBe(variant)
    }
  })
})

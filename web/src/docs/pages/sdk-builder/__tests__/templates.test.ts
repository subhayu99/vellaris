import { describe, expect, it } from 'vitest'
import { generateSdkSnippet } from '../templates'
import { defaultSdkBuilderState, type SdkBuilderState } from '../state'

function state(overrides: Partial<SdkBuilderState>): SdkBuilderState {
  return { ...defaultSdkBuilderState, ...overrides }
}

describe('generateSdkSnippet', () => {
  // ---- upload ----
  it('async upload: includes await client.push, asyncio.run, AsyncClient', () => {
    const snippet = generateSdkSnippet(state({ recipe: 'upload', variant: 'async' }))
    expect(snippet).toContain('await client.push')
    expect(snippet).toContain('asyncio.run(main())')
    expect(snippet).toContain('AsyncClient')
  })

  it('sync upload: includes client.push without await, uses with Client', () => {
    const snippet = generateSdkSnippet(state({ recipe: 'upload', variant: 'sync' }))
    expect(snippet).toContain('client.push')
    expect(snippet).not.toContain('await client.push')
    expect(snippet).toContain('with Client(')
    expect(snippet).not.toContain('asyncio.run')
  })

  it('async upload: includes matching imports and login call', () => {
    const snippet = generateSdkSnippet(state({ recipe: 'upload', variant: 'async' }))
    expect(snippet).toContain('from pathlib import Path')
    expect(snippet).toContain('from vellaris.client import AsyncClient')
    expect(snippet).toContain('client.login(username=')
  })

  it('sync upload: interpolates custom server URL and file path', () => {
    const snippet = generateSdkSnippet(
      state({
        recipe: 'upload',
        variant: 'sync',
        serverUrl: 'https://custom.example.com',
        filePath: 'report.pdf',
      }),
    )
    expect(snippet).toContain('https://custom.example.com')
    expect(snippet).toContain('report.pdf')
  })

  // ---- upload-and-share ----
  it('async upload-and-share: includes share_with and recipient', () => {
    const snippet = generateSdkSnippet(
      state({ recipe: 'upload-and-share', variant: 'async', recipient: 'carol' }),
    )
    expect(snippet).toContain('share_with=["carol"]')
    expect(snippet).toContain('await client.push')
    expect(snippet).toContain('asyncio.run(main())')
  })

  it('sync upload-and-share: no await, uses with Client', () => {
    const snippet = generateSdkSnippet(
      state({ recipe: 'upload-and-share', variant: 'sync', recipient: 'carol' }),
    )
    expect(snippet).toContain('client.push')
    expect(snippet).not.toContain('await client.push')
    expect(snippet).toContain('with Client(')
  })

  // ---- download ----
  it('async download: includes await client.pull, UUID import, AsyncClient', () => {
    const snippet = generateSdkSnippet(
      state({ recipe: 'download', variant: 'async', documentId: 'my-doc-id' }),
    )
    expect(snippet).toContain('await client.pull')
    expect(snippet).toContain('UUID("my-doc-id")')
    expect(snippet).toContain('AsyncClient')
    expect(snippet).toContain('asyncio.run(main())')
  })

  it('sync download: no await, includes document ID', () => {
    const snippet = generateSdkSnippet(
      state({ recipe: 'download', variant: 'sync', documentId: 'xyz-456' }),
    )
    expect(snippet).toContain('client.pull')
    expect(snippet).not.toContain('await client.pull')
    expect(snippet).toContain('UUID("xyz-456")')
    expect(snippet).toContain('with Client(')
  })

  // ---- list ----
  it('async list: includes await client.list_docs, AsyncClient', () => {
    const snippet = generateSdkSnippet(state({ recipe: 'list', variant: 'async' }))
    expect(snippet).toContain('await client.list_docs')
    expect(snippet).toContain('AsyncClient')
    expect(snippet).toContain('asyncio.run(main())')
  })

  it('sync list: no await, uses with Client', () => {
    const snippet = generateSdkSnippet(state({ recipe: 'list', variant: 'sync' }))
    expect(snippet).toContain('client.list_docs')
    expect(snippet).not.toContain('await client.list_docs')
    expect(snippet).toContain('with Client(')
  })

  // ---- share ----
  it('async share: includes await client.share_document, recipient, document ID', () => {
    const snippet = generateSdkSnippet(
      state({ recipe: 'share', variant: 'async', documentId: 'doc-789', recipient: 'dana' }),
    )
    expect(snippet).toContain('await client.share_document')
    expect(snippet).toContain('UUID("doc-789")')
    expect(snippet).toContain('"dana"')
    expect(snippet).toContain('asyncio.run(main())')
  })

  // ---- revoke ----
  it('async revoke: includes await client.revoke_document, recipient, document ID', () => {
    const snippet = generateSdkSnippet(
      state({ recipe: 'revoke', variant: 'async', documentId: 'doc-012', recipient: 'evan' }),
    )
    expect(snippet).toContain('await client.revoke_document')
    expect(snippet).toContain('UUID("doc-012")')
    expect(snippet).toContain('"evan"')
    expect(snippet).toContain('asyncio.run(main())')
  })

  it('sync revoke: no await, uses with Client', () => {
    const snippet = generateSdkSnippet(
      state({ recipe: 'revoke', variant: 'sync', documentId: 'doc-012', recipient: 'evan' }),
    )
    expect(snippet).toContain('client.revoke_document')
    expect(snippet).not.toContain('await client.revoke_document')
    expect(snippet).toContain('with Client(')
  })

  // ---- general ----
  it('all async snippets include login call', () => {
    const recipes = ['upload', 'upload-and-share', 'download', 'list', 'share', 'revoke'] as const
    for (const recipe of recipes) {
      const snippet = generateSdkSnippet(state({ recipe, variant: 'async' }))
      expect(snippet).toContain('client.login(username=')
    }
  })

  it('all sync snippets include login call', () => {
    const recipes = ['upload', 'upload-and-share', 'download', 'list', 'share', 'revoke'] as const
    for (const recipe of recipes) {
      const snippet = generateSdkSnippet(state({ recipe, variant: 'sync' }))
      expect(snippet).toContain('client.login(username=')
    }
  })
})

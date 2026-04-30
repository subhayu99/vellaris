import { describe, expect, it } from 'vitest'
import { generateCliCommand } from '../templates'
import { defaultCliBuilderState, type CliBuilderState } from '../state'

function state(overrides: Partial<CliBuilderState>): CliBuilderState {
  return { ...defaultCliBuilderState, ...overrides }
}

describe('generateCliCommand', () => {
  it('signup — contains vellaris signup, --username, and --server when serverUrl set', () => {
    const cmd = generateCliCommand(state({ command: 'signup', username: 'alice', serverUrl: 'https://vault.example.com' }))
    expect(cmd).toContain('vellaris signup')
    expect(cmd).toContain('--username alice')
    expect(cmd).toContain('--server https://vault.example.com')
  })

  it('signup — omits --server when serverUrl is empty', () => {
    const cmd = generateCliCommand(state({ command: 'signup', username: 'alice', serverUrl: '' }))
    expect(cmd).toContain('vellaris signup')
    expect(cmd).not.toContain('--server')
  })

  it('login — contains vellaris login and --username', () => {
    const cmd = generateCliCommand(state({ command: 'login', username: 'alice' }))
    expect(cmd).toContain('vellaris login')
    expect(cmd).toContain('--username alice')
  })

  it('logout — emits exactly "vellaris logout"', () => {
    const cmd = generateCliCommand(state({ command: 'logout' }))
    expect(cmd).toBe('vellaris logout')
  })

  it('whoami — emits exactly "vellaris whoami"', () => {
    const cmd = generateCliCommand(state({ command: 'whoami' }))
    expect(cmd).toBe('vellaris whoami')
  })

  it('push — contains vellaris push and the file path', () => {
    const cmd = generateCliCommand(state({ command: 'push', filePath: 'secret.pdf' }))
    expect(cmd).toContain('vellaris push')
    expect(cmd).toContain('secret.pdf')
  })

  it('push — includes --share-with when shareWith is non-empty', () => {
    const cmd = generateCliCommand(state({ command: 'push', filePath: 'doc.pdf', shareWith: 'bob,carol' }))
    expect(cmd).toContain('--share-with bob,carol')
  })

  it('push — omits --share-with when shareWith is empty', () => {
    const cmd = generateCliCommand(state({ command: 'push', filePath: 'doc.pdf', shareWith: '' }))
    expect(cmd).not.toContain('--share-with')
  })

  it('pull — contains vellaris pull and the document ID', () => {
    const cmd = generateCliCommand(state({ command: 'pull', documentId: 'abc-123' }))
    expect(cmd).toContain('vellaris pull')
    expect(cmd).toContain('abc-123')
  })

  it('ls — default scope omits --scope flag', () => {
    const cmd = generateCliCommand(state({ command: 'ls', scope: 'all' }))
    expect(cmd).toBe('vellaris ls')
  })

  it('ls — non-default scope includes --scope flag', () => {
    const cmd = generateCliCommand(state({ command: 'ls', scope: 'mine' }))
    expect(cmd).toContain('--scope mine')
  })

  it('rm — contains vellaris rm and the document ID', () => {
    const cmd = generateCliCommand(state({ command: 'rm', documentId: 'def-456' }))
    expect(cmd).toContain('vellaris rm')
    expect(cmd).toContain('def-456')
  })

  it('share — contains vellaris share, document ID, and --to recipient', () => {
    const cmd = generateCliCommand(state({ command: 'share', documentId: 'ghi-789', recipient: 'dana' }))
    expect(cmd).toContain('vellaris share')
    expect(cmd).toContain('ghi-789')
    expect(cmd).toContain('--to dana')
  })

  it('revoke — contains vellaris revoke, document ID, and --from recipient', () => {
    const cmd = generateCliCommand(state({ command: 'revoke', documentId: 'jkl-012', recipient: 'evan' }))
    expect(cmd).toContain('vellaris revoke')
    expect(cmd).toContain('jkl-012')
    expect(cmd).toContain('--from evan')
  })

  it('key-export — contains vellaris key export and the output path', () => {
    const cmd = generateCliCommand(state({ command: 'key-export', keyExportPath: './my-key.bin' }))
    expect(cmd).toContain('vellaris key export')
    expect(cmd).toContain('./my-key.bin')
  })

  it('key-import — contains vellaris key import and the input path', () => {
    const cmd = generateCliCommand(state({ command: 'key-import', keyImportPath: './my-key.bin' }))
    expect(cmd).toContain('vellaris key import')
    expect(cmd).toContain('./my-key.bin')
  })
})

/* CLI command builder state. URL-serialized for share-by-link. */

export type CliCommand =
  | 'signup'
  | 'login'
  | 'logout'
  | 'whoami'
  | 'push'
  | 'pull'
  | 'ls'
  | 'rm'
  | 'share'
  | 'revoke'
  | 'key-export'
  | 'key-import'

export type LsScope = 'all' | 'mine' | 'shared'

export interface CliBuilderState {
  command: CliCommand
  username?: string
  filePath?: string
  documentId?: string
  shareWith?: string  // comma-separated for push --share-with
  recipient?: string  // for share/revoke --to/--from
  scope?: LsScope
  keyExportPath?: string
  keyImportPath?: string
  serverUrl?: string  // for signup
}

export const defaultCliBuilderState: CliBuilderState = {
  command: 'push',
  username: 'alice',
  filePath: 'document.pdf',
  documentId: '<document-uuid>',
  shareWith: '',
  recipient: 'bob',
  scope: 'all',
  keyExportPath: './my-key.bin',
  keyImportPath: './my-key.bin',
  serverUrl: 'https://vellaris.example.com',
}

const COMMANDS: ReadonlySet<CliCommand> = new Set([
  'signup', 'login', 'logout', 'whoami',
  'push', 'pull', 'ls', 'rm',
  'share', 'revoke',
  'key-export', 'key-import',
])

const SCOPES: ReadonlySet<LsScope> = new Set(['all', 'mine', 'shared'])

const URL_FIELDS: Record<string, keyof CliBuilderState> = {
  cmd: 'command',
  u: 'username',
  f: 'filePath',
  doc: 'documentId',
  sw: 'shareWith',
  r: 'recipient',
  sc: 'scope',
  ke: 'keyExportPath',
  ki: 'keyImportPath',
  s: 'serverUrl',
}

export function encodeStateToUrl(state: CliBuilderState): string {
  const sp = new URLSearchParams()
  for (const [param, key] of Object.entries(URL_FIELDS)) {
    const v = state[key]
    if (v === undefined || v === '') continue
    if (defaultCliBuilderState[key] === v) continue
    sp.set(param, String(v))
  }
  return `?${sp.toString()}`
}

export function decodeStateFromUrl(search: string): CliBuilderState {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const out: CliBuilderState = { ...defaultCliBuilderState }
  for (const [param, key] of Object.entries(URL_FIELDS)) {
    const raw = sp.get(param)
    if (raw === null) continue
    if (key === 'command') {
      if (COMMANDS.has(raw as CliCommand)) out.command = raw as CliCommand
    } else if (key === 'scope') {
      if (SCOPES.has(raw as LsScope)) out.scope = raw as LsScope
    } else {
      ;(out[key] as string) = raw
    }
  }
  return out
}

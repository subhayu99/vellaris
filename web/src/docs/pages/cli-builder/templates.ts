import type { CliCommand, CliBuilderState } from './state'

export interface CommandHelp {
  cmd: CliCommand
  label: string  // human-friendly label
  help: string   // one-line help text
}

export const COMMAND_HELP: readonly CommandHelp[] = [
  { cmd: 'signup', label: 'signup', help: 'Create a new user on a server.' },
  { cmd: 'login', label: 'login', help: 'Sign in (challenge-response, no password sent to server).' },
  { cmd: 'logout', label: 'logout', help: 'Discard the local session token.' },
  { cmd: 'whoami', label: 'whoami', help: 'Print the currently signed-in user.' },
  { cmd: 'push', label: 'push', help: 'Encrypt + upload a file. Optionally share with recipients.' },
  { cmd: 'pull', label: 'pull', help: 'Download + decrypt a document by ID.' },
  { cmd: 'ls', label: 'ls', help: 'List documents (yours + shared with you).' },
  { cmd: 'rm', label: 'rm', help: 'Delete a document (owner only).' },
  { cmd: 'share', label: 'share', help: 'Grant a user read access to your document.' },
  { cmd: 'revoke', label: 'revoke', help: "Remove a user's access to your document." },
  { cmd: 'key-export', label: 'key export', help: 'Export your private key to a file (encrypted).' },
  { cmd: 'key-import', label: 'key import', help: 'Import a private key from a file.' },
]

export function generateCliCommand(s: CliBuilderState): string {
  switch (s.command) {
    case 'signup': {
      const flags: string[] = []
      flags.push(`--username ${s.username || 'alice'}`)
      if (s.serverUrl && s.serverUrl !== '') flags.push(`--server ${s.serverUrl}`)
      return `vellaris signup ${flags.join(' ')}`
    }
    case 'login':
      return `vellaris login --username ${s.username || 'alice'}`
    case 'logout':
      return 'vellaris logout'
    case 'whoami':
      return 'vellaris whoami'
    case 'push': {
      const file = s.filePath || 'document.pdf'
      const share = s.shareWith && s.shareWith.trim() ? ` --share-with ${s.shareWith.trim()}` : ''
      return `vellaris push ${file}${share}`
    }
    case 'pull':
      return `vellaris pull ${s.documentId || '<uuid>'}`
    case 'ls':
      return `vellaris ls${s.scope && s.scope !== 'all' ? ` --scope ${s.scope}` : ''}`
    case 'rm':
      return `vellaris rm ${s.documentId || '<uuid>'}`
    case 'share':
      return `vellaris share ${s.documentId || '<uuid>'} --to ${s.recipient || 'bob'}`
    case 'revoke':
      return `vellaris revoke ${s.documentId || '<uuid>'} --from ${s.recipient || 'bob'}`
    case 'key-export':
      return `vellaris key export ${s.keyExportPath || './my-key.bin'}`
    case 'key-import':
      return `vellaris key import ${s.keyImportPath || './my-key.bin'}`
  }
}

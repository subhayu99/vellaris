import type { CliBuilderState, LsScope } from '../state'

interface Props {
  state: CliBuilderState
  onChange: (patch: Partial<CliBuilderState>) => void
}

export function ArgsForm({ state, onChange }: Props) {
  const cmd = state.command
  if (cmd === 'logout' || cmd === 'whoami') {
    return <p className="cli-args-empty">No arguments — just run it.</p>
  }
  return (
    <div className="cli-args-grid">
      {(cmd === 'signup' || cmd === 'login') && (
        <label>
          Username
          <input
            type="text"
            value={state.username || ''}
            onChange={(e) => onChange({ username: e.target.value })}
          />
        </label>
      )}
      {cmd === 'signup' && (
        <label>
          Server URL <span className="cli-hint">(optional; saved to ~/.vellaris/config.toml)</span>
          <input
            type="text"
            value={state.serverUrl || ''}
            onChange={(e) => onChange({ serverUrl: e.target.value })}
          />
        </label>
      )}
      {cmd === 'push' && (
        <>
          <label>
            File path
            <input
              type="text"
              value={state.filePath || ''}
              onChange={(e) => onChange({ filePath: e.target.value })}
            />
          </label>
          <label>
            Share with <span className="cli-hint">(comma-separated usernames; optional)</span>
            <input
              type="text"
              value={state.shareWith || ''}
              onChange={(e) => onChange({ shareWith: e.target.value })}
              placeholder="alice,bob"
            />
          </label>
        </>
      )}
      {(cmd === 'pull' || cmd === 'rm' || cmd === 'share' || cmd === 'revoke') && (
        <label>
          Document ID
          <input
            type="text"
            value={state.documentId || ''}
            onChange={(e) => onChange({ documentId: e.target.value })}
          />
        </label>
      )}
      {(cmd === 'share' || cmd === 'revoke') && (
        <label>
          {cmd === 'share' ? 'Share with' : 'Revoke from'}
          <input
            type="text"
            value={state.recipient || ''}
            onChange={(e) => onChange({ recipient: e.target.value })}
          />
        </label>
      )}
      {cmd === 'ls' && (
        <fieldset className="cli-scope-radios">
          <legend>Scope</legend>
          {(['all', 'mine', 'shared'] as const).map((s) => (
            <label key={s}>
              <input
                type="radio"
                checked={state.scope === s}
                onChange={() => onChange({ scope: s as LsScope })}
              />
              {s}
            </label>
          ))}
        </fieldset>
      )}
      {cmd === 'key-export' && (
        <label>
          Output path
          <input
            type="text"
            value={state.keyExportPath || ''}
            onChange={(e) => onChange({ keyExportPath: e.target.value })}
          />
        </label>
      )}
      {cmd === 'key-import' && (
        <label>
          Input path
          <input
            type="text"
            value={state.keyImportPath || ''}
            onChange={(e) => onChange({ keyImportPath: e.target.value })}
          />
        </label>
      )}
    </div>
  )
}

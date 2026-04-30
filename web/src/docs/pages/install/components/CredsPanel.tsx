import type { InstallState } from '../state'

interface Props {
  state: InstallState
  onChange: (patch: Partial<InstallState>) => void
  onForgetEverything: () => void
}

export function CredsPanel({ state, onChange, onForgetEverything }: Props) {
  return (
    <section className="install-panel install-panel-creds">
      <header className="install-panel-header">
        <h3>Credentials</h3>
      </header>
      <fieldset className="install-fieldset">
        <label>
          <input
            type="radio"
            name="creds-mode"
            checked={state.credsMode === 'export'}
            onChange={() => onChange({ credsMode: 'export' })}
          />
          Generate <code>export</code> block — paste creds in shell <em>(recommended; snippets stay shareable)</em>
        </label>
        <label>
          <input
            type="radio"
            name="creds-mode"
            checked={state.credsMode === 'inline'}
            onChange={() => onChange({ credsMode: 'inline' })}
          />
          Paste creds here — generate complete commands
          <em className="install-warn">
            ⚠ Stored in this browser only. Don't screenshot or share the generated snippet.
          </em>
        </label>
      </fieldset>

      {state.credsMode === 'inline' && (
        <div className="install-panel-grid">
          {state.db !== 'sqlite' && (
            <label>
              DB password
              <input
                type="password"
                value={state.credDbPassword || ''}
                onChange={(e) => onChange({ credDbPassword: e.target.value })}
              />
            </label>
          )}
          {state.storage === 's3' && (
            <>
              <label>
                AWS_ACCESS_KEY_ID
                <input
                  type="password"
                  value={state.credAwsAccessKeyId || ''}
                  onChange={(e) => onChange({ credAwsAccessKeyId: e.target.value })}
                />
              </label>
              <label>
                AWS_SECRET_ACCESS_KEY
                <input
                  type="password"
                  value={state.credAwsSecretAccessKey || ''}
                  onChange={(e) => onChange({ credAwsSecretAccessKey: e.target.value })}
                />
              </label>
              <label>
                AWS_REGION
                <input
                  type="text"
                  value={state.credAwsRegion || 'us-east-1'}
                  onChange={(e) => onChange({ credAwsRegion: e.target.value })}
                />
              </label>
            </>
          )}
        </div>
      )}

      <p className="install-fineprint">
        <button type="button" onClick={onForgetEverything} className="install-link-button">
          Forget everything
        </button>{' '}
        — wipes saved configuration and credentials from this browser.
      </p>
    </section>
  )
}

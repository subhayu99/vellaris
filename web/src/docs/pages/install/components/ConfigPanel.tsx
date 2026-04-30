import type { DbBackend, InstallState } from '../state'

interface Props {
  state: InstallState
  onChange: (patch: Partial<InstallState>) => void
  onReset: () => void
}

export function ConfigPanel({ state, onChange, onReset }: Props) {
  const showS3 = state.storage === 's3'
  const showBucket =
    state.storage === 's3' || state.storage === 'gcs' || state.storage === 'azure'
  const showDb: Record<DbBackend, boolean> = {
    sqlite: false,
    postgres: true,
    mysql: true,
  }
  return (
    <section className="install-panel">
      <header className="install-panel-header">
        <h3>Configure for your environment</h3>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </header>
      <div className="install-panel-grid">
        {showBucket && (
          <label>
            Bucket / container name
            <input
              type="text"
              value={state.bucket}
              onChange={(e) => onChange({ bucket: e.target.value })}
            />
          </label>
        )}
        {showS3 && (
          <label>
            S3 endpoint URL <span className="install-hint">(MinIO / R2 / B2 — leave blank for AWS)</span>
            <input
              type="text"
              placeholder="https://s3.example.com"
              value={state.endpoint}
              onChange={(e) => onChange({ endpoint: e.target.value })}
            />
          </label>
        )}
        {showDb[state.db] && (
          <>
            <label>
              DB host
              <input
                type="text"
                value={state.dbHost}
                onChange={(e) => onChange({ dbHost: e.target.value })}
              />
            </label>
            <label>
              DB port
              <input
                type="text"
                value={state.dbPort}
                onChange={(e) => onChange({ dbPort: e.target.value })}
              />
            </label>
            <label>
              DB name
              <input
                type="text"
                value={state.dbName}
                onChange={(e) => onChange({ dbName: e.target.value })}
              />
            </label>
            <label>
              DB user
              <input
                type="text"
                value={state.dbUser}
                onChange={(e) => onChange({ dbUser: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      <p className="install-fineprint">
        Saved locally in your browser — never sent to any server. Don't put credentials here.
      </p>
    </section>
  )
}

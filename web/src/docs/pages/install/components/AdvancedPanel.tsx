import type { InstallState, ProxyMode } from '../state'

interface Props {
  state: InstallState
  onChange: (patch: Partial<InstallState>) => void
}

export function AdvancedPanel({ state, onChange }: Props) {
  const toggle = () => onChange({ advancedOpen: !state.advancedOpen })

  return (
    <section className="install-panel install-panel-advanced">
      <details open={state.advancedOpen} onToggle={toggle}>
        <summary>
          <h3>Advanced configuration</h3>
          <span className="install-hint">
            Rate limits, sessions, CORS, audit signing, replicas, reverse proxy, TLS
          </span>
        </summary>

        <div className="install-advanced-grid">
          {/* Limits */}
          <fieldset className="install-fieldset">
            <legend>Limits</legend>
            <label>
              Max upload (MB)
              <input
                type="number"
                min={1}
                max={51200}
                value={state.maxUploadMb}
                onChange={(e) => onChange({ maxUploadMb: Number(e.target.value) })}
              />
            </label>
            <label>
              Rate limit (per minute)
              <input
                type="number"
                min={1}
                value={state.rateLimitPerMin}
                onChange={(e) => onChange({ rateLimitPerMin: Number(e.target.value) })}
              />
            </label>
            <label>
              Rate limit burst
              <input
                type="number"
                min={1}
                value={state.rateLimitBurst}
                onChange={(e) => onChange({ rateLimitBurst: Number(e.target.value) })}
              />
            </label>
          </fieldset>

          {/* Sessions */}
          <fieldset className="install-fieldset">
            <legend>Sessions</legend>
            <label>
              Session TTL (hours)
              <input
                type="number"
                min={1}
                max={168}
                value={state.sessionTtlHours}
                onChange={(e) => onChange({ sessionTtlHours: Number(e.target.value) })}
              />
            </label>
            <label>
              Challenge TTL (minutes)
              <input
                type="number"
                min={1}
                max={60}
                value={state.challengeTtlMin}
                onChange={(e) => onChange({ challengeTtlMin: Number(e.target.value) })}
              />
            </label>
          </fieldset>

          {/* CORS */}
          <fieldset className="install-fieldset">
            <legend>CORS</legend>
            <label>
              Allowed origins <span className="install-hint">(comma-separated, * for any)</span>
              <input
                type="text"
                value={state.corsOrigins}
                onChange={(e) => onChange({ corsOrigins: e.target.value })}
                placeholder="https://app.example.com,https://admin.example.com"
              />
            </label>
          </fieldset>

          {/* Audit signing key */}
          <fieldset className="install-fieldset">
            <legend>Audit signing key</legend>
            <label>
              <input
                type="radio"
                checked={state.auditKeyMode === 'generate'}
                onChange={() => onChange({ auditKeyMode: 'generate' })}
              />
              Generate fresh in memory{' '}
              <em>(dev only — log entries can't be verified across restarts)</em>
            </label>
            <label>
              <input
                type="radio"
                checked={state.auditKeyMode === 'path'}
                onChange={() => onChange({ auditKeyMode: 'path' })}
              />
              Read from file
            </label>
            {state.auditKeyMode === 'path' && (
              <label>
                Path
                <input
                  type="text"
                  value={state.auditKeyPath}
                  onChange={(e) => onChange({ auditKeyPath: e.target.value })}
                />
              </label>
            )}
          </fieldset>

          {/* Migrations */}
          <fieldset className="install-fieldset">
            <legend>Migrations</legend>
            <label>
              <input
                type="checkbox"
                checked={state.autoMigrate}
                onChange={(e) => onChange({ autoMigrate: e.target.checked })}
              />
              Auto-run on startup <span className="install-hint">(VELLARIS_AUTO_MIGRATE)</span>
            </label>
          </fieldset>

          {/* Replicas */}
          <fieldset className="install-fieldset">
            <legend>Replicas</legend>
            <label>
              Number of server replicas
              <input
                type="number"
                min={1}
                max={20}
                value={state.replicas}
                onChange={(e) => onChange({ replicas: Number(e.target.value) })}
              />
            </label>
            {state.replicas > 1 && state.db === 'sqlite' && (
              <p className="install-warn">
                SQLite doesn't support multiple writers. Switch to Postgres or MySQL above.
              </p>
            )}
          </fieldset>

          {/* Reverse proxy */}
          <fieldset className="install-fieldset">
            <legend>Reverse proxy</legend>
            <label>
              Type
              <select
                value={state.proxyMode}
                onChange={(e) => onChange({ proxyMode: e.target.value as ProxyMode })}
              >
                <option value="none">None (direct access)</option>
                <option value="caddy">Caddy</option>
                <option value="nginx">nginx</option>
                <option value="traefik">Traefik</option>
              </select>
            </label>
            {state.proxyMode !== 'none' && (
              <label>
                Hostname
                <input
                  type="text"
                  value={state.proxyHostname}
                  onChange={(e) => onChange({ proxyHostname: e.target.value })}
                  placeholder="vault.example.com"
                />
              </label>
            )}
          </fieldset>

          {/* WebAuthn / passkeys */}
          <fieldset className="install-fieldset">
            <legend>Passkeys (WebAuthn)</legend>
            <label>
              SPA hostname
              <input
                type="text"
                value={state.webauthnSpaHost}
                onChange={(e) => onChange({ webauthnSpaHost: e.target.value })}
                placeholder={
                  state.proxyMode !== 'none' && state.proxyHostname
                    ? `defaults to ${state.proxyHostname}`
                    : 'vellaris.example.com'
                }
              />
              <span className="install-hint">
                Where the browser loads the SPA. Passkeys are bound to this domain. Leave empty to
                use the proxy hostname above when the SPA + API share a host.
              </span>
            </label>
          </fieldset>

          {/* TLS */}
          <fieldset className="install-fieldset">
            <legend>TLS</legend>
            <label>
              <input
                type="radio"
                checked={state.tlsMode === 'off'}
                onChange={() => onChange({ tlsMode: 'off' })}
              />
              Off (proxy handles it)
            </label>
            <label>
              <input
                type="radio"
                checked={state.tlsMode === 'auto'}
                onChange={() => onChange({ tlsMode: 'auto' })}
              />
              Caddy auto-cert (Let's Encrypt)
            </label>
            <label>
              <input
                type="radio"
                checked={state.tlsMode === 'manual'}
                onChange={() => onChange({ tlsMode: 'manual' })}
              />
              Manual cert paths
            </label>
            {state.tlsMode === 'manual' && (
              <>
                <label>
                  Cert path
                  <input
                    type="text"
                    value={state.tlsCertPath}
                    onChange={(e) => onChange({ tlsCertPath: e.target.value })}
                  />
                </label>
                <label>
                  Key path
                  <input
                    type="text"
                    value={state.tlsKeyPath}
                    onChange={(e) => onChange({ tlsKeyPath: e.target.value })}
                  />
                </label>
              </>
            )}
          </fieldset>
        </div>
      </details>
    </section>
  )
}

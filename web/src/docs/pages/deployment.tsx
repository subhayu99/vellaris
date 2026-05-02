import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IServer } from '../../marketing/icons.tsx'
import { DOCS_DEPLOY } from '../../marketing/links.ts'
import { CodeBlock } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'
import { RunModePicker } from './install/components/RunModePicker'
import { BackendPickers } from './install/components/BackendPickers'
import { AdvancedPanel } from './install/components/AdvancedPanel'
import { ConfigPanel } from './install/components/ConfigPanel'
import { CredsPanel } from './install/components/CredsPanel'
import { SnippetBox } from './install/components/SnippetBox'
import {
  decodeStateFromUrl,
  defaultInstallState,
  encodeStateToUrl,
  forgetEverything,
  loadConfigFromLocalStorage,
  loadCredsFromLocalStorage,
  saveConfigToLocalStorage,
  saveCredsToLocalStorage,
  type InstallState,
} from './install/state'
import { generateExportBlock, generateProxySnippet, generateRunSnippet } from './install/templates'
import './install/install.css'
import { APP_VERSION } from '../../util/version.ts'

const VERSION = APP_VERSION

export function DeploymentPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [state, setState] = useState<InstallState>(() => {
    // Priority: URL > localStorage config > defaults. Creds always loaded from LS.
    const fromUrl = location.search ? decodeStateFromUrl(location.search) : null
    const fromLs = loadConfigFromLocalStorage()
    const merged = { ...defaultInstallState, ...fromLs, ...(fromUrl || {}) }
    const creds = loadCredsFromLocalStorage()
    return { ...merged, ...creds }
  })

  // Sync state → URL (non-creds) and localStorage.
  useEffect(() => {
    const newSearch = encodeStateToUrl(state)
    if (newSearch !== location.search) {
      navigate({ search: newSearch }, { replace: true })
    }
    saveConfigToLocalStorage(state)
    saveCredsToLocalStorage(state)
  }, [state, location.search, navigate])

  function patch(p: Partial<InstallState>) {
    setState((prev) => ({ ...prev, ...p }))
  }

  function reset() {
    setState((prev) => ({ ...defaultInstallState, credsMode: prev.credsMode }))
  }

  function forgetAll() {
    forgetEverything()
    setState(defaultInstallState)
  }

  const exportBlock = useMemo(() => generateExportBlock(state, VERSION), [state])
  const runSnippet = useMemo(() => generateRunSnippet(state, VERSION), [state])
  const proxySnippet = useMemo(() => generateProxySnippet(state), [state])

  return (
    <DocsPageShell
      to={DOCS_DEPLOY}
      title="Deployment"
      glyph={<IServer size={28} />}
      lead="Pick how you want to run Vellaris and which backends you have. The snippets below update live and are bookmarkable. The full env-var reference is at the bottom of this page."
    >
      <div className="install-page">
        <RunModePicker value={state.runMode} onChange={(runMode) => patch({ runMode })} />

        <BackendPickers
          db={state.db}
          storage={state.storage}
          image={state.image}
          runMode={state.runMode}
          onDb={(db) => patch({ db })}
          onStorage={(storage) => patch({ storage })}
          onImage={(image) => patch({ image })}
        />

        <ConfigPanel state={state} onChange={patch} onReset={reset} />

        <CredsPanel state={state} onChange={patch} onForgetEverything={forgetAll} />

        <AdvancedPanel state={state} onChange={patch} />

        {state.credsMode === 'export' && exportBlock && (
          <SnippetBox title="1. Set credentials in your shell" contents={exportBlock} />
        )}

        <SnippetBox
          title={
            state.credsMode === 'export' && exportBlock
              ? '2. Run Vellaris'
              : 'Run Vellaris'
          }
          contents={runSnippet}
          warn={state.credsMode === 'inline'}
        />

        {proxySnippet && (
          <SnippetBox title={proxySnippet.title} contents={proxySnippet.contents} />
        )}
      </div>

      <section>
        <h2>Reference</h2>

        <h3>Sizing</h3>
        <div className="docs-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Workload</th>
              <th>RAM</th>
              <th>CPU</th>
              <th>Disk</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Single user</td>
              <td>256 MB</td>
              <td>1 vCPU</td>
              <td>1 GB</td>
              <td>SQLite + local FS, slim image.</td>
            </tr>
            <tr>
              <td>10 users</td>
              <td>512 MB</td>
              <td>1 vCPU</td>
              <td>matches data</td>
              <td>Postgres recommended.</td>
            </tr>
            <tr>
              <td>100 users</td>
              <td>1 GB</td>
              <td>2 vCPU</td>
              <td>matches data</td>
              <td>S3-compatible storage recommended.</td>
            </tr>
            <tr>
              <td>1000+ users</td>
              <td>2+ GB</td>
              <td>4+ vCPU</td>
              <td>unbounded (S3)</td>
              <td>Run &gt;=2 replicas behind a load balancer.</td>
            </tr>
          </tbody>
        </table>
        </div>

        <h3>Environment variables</h3>
        <p>All config flows through environment variables:</p>
        <div className="docs-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Default</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>VELLARIS_HOST</code>
              </td>
              <td>
                <code>0.0.0.0</code>
              </td>
              <td>Bind address.</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_PORT</code>
              </td>
              <td>
                <code>8000</code>
              </td>
              <td>Bind port.</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_DATABASE_URL</code>
              </td>
              <td>
                <code>sqlite+aiosqlite:///./vellaris.db</code>
              </td>
              <td>
                SQLAlchemy URL — <code>postgresql+asyncpg://…</code>, <code>mysql+asyncmy://…</code>,
                or <code>sqlite+aiosqlite://…</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_AUTO_MIGRATE</code>
              </td>
              <td>
                <code>1</code>
              </td>
              <td>
                Run <code>alembic upgrade head</code> on startup. Set <code>0</code> for blue/green
                pipelines.
              </td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_BLOB_URL</code>
              </td>
              <td>
                <code>file://./var/blobs</code>
              </td>
              <td>
                fsspec URL — <code>file://</code>, <code>s3://</code>, <code>gs://</code>,{' '}
                <code>az://</code>, <code>memory://</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_BLOB_OPTIONS_JSON</code>
              </td>
              <td>(unset)</td>
              <td>Optional JSON-encoded storage_options (endpoint URL, custom certs, etc.).</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_AUDIT_SIGNING_KEY_PATH</code>
              </td>
              <td>(generated in memory)</td>
              <td>Path to a 32-byte raw Ed25519 private key. Persist this in production.</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_MAX_UPLOAD_BYTES</code>
              </td>
              <td>
                <code>104857600</code> (100 MiB)
              </td>
              <td>Per-file ceiling.</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_RATE_LIMIT_PER_MINUTE</code>
              </td>
              <td>
                <code>120</code>
              </td>
              <td>Per-IP soft limit.</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_RATE_LIMIT_BURST</code>
              </td>
              <td>
                <code>20</code>
              </td>
              <td>Per-IP burst budget.</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_CORS_ALLOW_ORIGINS</code>
              </td>
              <td>
                <code>{`["*"]`}</code>
              </td>
              <td>Restrict in production.</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_SESSION_TTL_SECONDS</code>
              </td>
              <td>
                <code>28800</code> (8 h)
              </td>
              <td>Session lifetime.</td>
            </tr>
            <tr>
              <td>
                <code>VELLARIS_CHALLENGE_TTL_SECONDS</code>
              </td>
              <td>
                <code>300</code> (5 m)
              </td>
              <td>Login-challenge lifetime.</td>
            </tr>
          </tbody>
        </table>
        </div>

        <h3>Image variants</h3>
        <div className="docs-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Size</th>
              <th>Bundled drivers</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>ghcr.io/subhayu99/vellaris:0.5.0</code>
              </td>
              <td>~120 MB</td>
              <td>SQLite + local FS only</td>
            </tr>
            <tr>
              <td>
                <code>ghcr.io/subhayu99/vellaris:0.5.0-full</code>
              </td>
              <td>~350 MB</td>
              <td>All DBs (Postgres / MySQL / SQLite) + S3 / GCS / Azure</td>
            </tr>
          </tbody>
        </table>
        </div>

        <h3>Docker — single container (SQLite)</h3>
        <p>Good for personal use:</p>
        <CodeBlock lang="shell">
          {`docker run -d --name vellaris \\
  -p 8000:8000 \\
  -v vellaris-data:/data \\
  -e VELLARIS_DATABASE_URL='sqlite+aiosqlite:////data/vellaris.db' \\
  -e VELLARIS_BLOB_URL='file:///data/blobs' \\
  ghcr.io/subhayu99/vellaris:0.5.0`}
        </CodeBlock>

        <h3>Docker Compose — Postgres-backed</h3>
        <p>
          The repo ships{' '}
          <a
            href="https://github.com/subhayu99/vellaris/blob/main/docker/compose.yaml"
            target="_blank"
            rel="noreferrer"
          >
            <code>docker/compose.yaml</code>
          </a>
          :
        </p>
        <CodeBlock lang="shell">
          {`git clone https://github.com/subhayu99/vellaris && cd vellaris
docker compose -f docker/compose.yaml up -d`}
        </CodeBlock>
        <p>
          Postgres data lives in a named volume; ciphertext blobs land on a host mount you can back
          up. Customize via <code>.env</code> next to the compose file.
        </p>

        <h3>Kubernetes — Helm chart sketch</h3>
        <p>
          A minimal <code>values.yaml</code>:
        </p>
        <CodeBlock lang="yaml">
          {`image:
  repository: ghcr.io/subhayu99/vellaris
  tag: v${APP_VERSION}
  pullPolicy: IfNotPresent

replicaCount: 2

config:
  databaseUrl: postgresql+psycopg://vellaris:…@vellaris-postgres:5432/vellaris
  blobBackend: s3
  s3:
    bucket: vellaris-blobs
    region: us-east-1

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: vault.example.com
      paths: [/]
  tls:
    - hosts: [vault.example.com]
      secretName: vault-example-com-tls

resources:
  requests: { cpu: 250m, memory: 512Mi }
  limits:   { cpu: 1000m, memory: 1Gi }`}
        </CodeBlock>
        <p>
          A real chart isn&rsquo;t published yet — drop the manifests at <code>deploy/k8s/</code> when
          you do this.
        </p>

        <h3>Fly.io — one-click</h3>
        <CodeBlock lang="shell">
          {`flyctl launch --image ghcr.io/subhayu99/vellaris:0.5.0-full --no-deploy
flyctl secrets set \\
  VELLARIS_DATABASE_URL="$(flyctl postgres attach … --format json | jq -r '.connection_string')" \\
  VELLARIS_AUDIT_SIGNING_KEY_PATH=/secrets/audit.key
flyctl deploy`}
        </CodeBlock>
        <p>
          Add a Tigris S3 attachment for blob storage, then set{' '}
          <code>VELLARIS_BLOB_URL=s3://your-bucket</code> and the standard{' '}
          <code>AWS_ACCESS_KEY_ID</code> / <code>AWS_SECRET_ACCESS_KEY</code> secrets.
        </p>

        <h3>Railway</h3>
        <CodeBlock lang="shell">
          {`railway init --template ghcr.io/subhayu99/vellaris:0.5.0-full
railway add --plugin postgresql
railway variables set VELLARIS_AUDIT_SIGNING_KEY_PATH=/secrets/audit.key
railway up`}
        </CodeBlock>

        <h3>Behind a reverse proxy</h3>
        <p>
          Vellaris doesn&rsquo;t terminate TLS — run it behind nginx / Caddy / Traefik / the load
          balancer of your cloud. The server reads <code>X-Forwarded-For</code> for rate-limiting;
          trust it only when you&rsquo;re behind a proxy you control.
        </p>
        <p>A minimal Caddyfile:</p>
        <CodeBlock lang="caddyfile">
          {`vault.example.com {
  reverse_proxy 127.0.0.1:8000
}`}
        </CodeBlock>

        <h3>Backup</h3>
        <p>Two pieces:</p>
        <ul>
          <li>
            <strong>Database</strong>: <code>pg_dump</code> (or <code>sqlite3 .dump</code>) on a
            schedule. Restore with <code>psql &lt; dump.sql</code>. Migrations are idempotent.
          </li>
          <li>
            <strong>Blobs</strong>: <code>rclone sync /var/lib/vellaris/blobs s3:backup</code> — or
            just use S3 backend with cross-region replication.
          </li>
        </ul>
        <div className="docs-callout is-warn">
          <span className="label">Persist the audit signing key</span>
          <span>
            The audit signing key (<code>VELLARIS_AUDIT_SIGNING_KEY_PATH</code>) must persist or
            existing audit log entries become unverifiable. Stash it in your secret store before going
            live.
          </span>
        </div>

        <h3>Health check</h3>
        <p>
          <code>GET /health</code> returns <code>{'{"status":"ok"}'}</code> when the DB is reachable.
          Use it as your liveness + readiness probe.
        </p>
      </section>
    </DocsPageShell>
  )
}

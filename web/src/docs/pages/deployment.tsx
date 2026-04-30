import { IServer } from '../../marketing/icons.tsx'
import { DOCS_DEPLOY } from '../../marketing/links.ts'
import { CodeBlock } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'

export function DeploymentPage() {
  return (
    <DocsPageShell
      to={DOCS_DEPLOY}
      title="Deployment."
      glyph={<IServer size={28} />}
      lead={
        <>
          The Vellaris server is a single FastAPI process plus a database (Postgres in production,
          SQLite for dev / single-user). Blobs go to local disk by default; flip a flag to push to
          S3-compatible storage.
        </>
      }
    >
      <h2>Sizing</h2>
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
            <td>Single user, dev</td>
            <td>256 MB</td>
            <td>1 vCPU</td>
            <td>1 GB</td>
            <td>SQLite + local disk.</td>
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
            <td>S3 backend recommended.</td>
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
      <p>
        The server is stateless apart from the DB + blob store, so horizontal scaling is &ldquo;add
        replicas behind a load balancer&rdquo;.
      </p>

      <h2>Configuration</h2>
      <p>
        All config flows through environment variables. The full list is in{' '}
        <code>src/vellaris/server/config.py</code>; the most important ones:
      </p>
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
              Use <code>postgresql+psycopg://…</code> in prod.
            </td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_BLOB_BACKEND</code>
            </td>
            <td>
              <code>local</code>
            </td>
            <td>
              <code>local</code> or <code>s3</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_BLOB_LOCAL_DIR</code>
            </td>
            <td>
              <code>./blobs</code>
            </td>
            <td>Local backend storage path.</td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_BLOB_S3_BUCKET</code>
            </td>
            <td>(unset)</td>
            <td>S3 bucket for ciphertext blobs.</td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_BLOB_S3_REGION</code>
            </td>
            <td>
              <code>us-east-1</code>
            </td>
            <td>—</td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_BLOB_S3_ENDPOINT</code>
            </td>
            <td>(unset)</td>
            <td>Override for MinIO / R2 / B2.</td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_AUDIT_SIGNING_KEY</code>
            </td>
            <td>(generated on first start)</td>
            <td>Ed25519 raw key, base64. Persist this.</td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_MAX_UPLOAD_BYTES</code>
            </td>
            <td>
              <code>5_368_709_120</code> (5 GiB)
            </td>
            <td>Per-file ceiling.</td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_RATE_LIMIT_PER_IP</code>
            </td>
            <td>
              <code>120/min</code>
            </td>
            <td>Soft limit.</td>
          </tr>
          <tr>
            <td>
              <code>VELLARIS_CORS_ORIGINS</code>
            </td>
            <td>
              <code>*</code> (dev), <code>[]</code> (prod)
            </td>
            <td>Comma-separated for the SPA.</td>
          </tr>
        </tbody>
      </table>

      <h2>Docker — single container (SQLite)</h2>
      <p>Good for personal use:</p>
      <CodeBlock lang="shell">
        {`docker run -d --name vellaris \\
  -p 8000:8000 \\
  -v vellaris-data:/data \\
  -e VELLARIS_DATABASE_URL='sqlite+aiosqlite:////data/vellaris.db' \\
  -e VELLARIS_BLOB_LOCAL_DIR=/data/blobs \\
  -e VELLARIS_AUDIT_SIGNING_KEY="$(openssl rand -base64 32)" \\
  ghcr.io/subhayu99/vellaris:latest`}
      </CodeBlock>

      <h2>Docker Compose — Postgres-backed</h2>
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

      <h2>Kubernetes — Helm chart sketch</h2>
      <p>
        A minimal <code>values.yaml</code>:
      </p>
      <CodeBlock lang="yaml">
        {`image:
  repository: ghcr.io/subhayu99/vellaris
  tag: v0.3.1
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

      <h2>Fly.io — one-click</h2>
      <CodeBlock lang="shell">
        {`flyctl launch --image ghcr.io/subhayu99/vellaris:latest --no-deploy
flyctl secrets set \\
  VELLARIS_DATABASE_URL="$(flyctl postgres attach … --format json | jq -r '.connection_string')" \\
  VELLARIS_AUDIT_SIGNING_KEY="$(openssl rand -base64 32)"
flyctl deploy`}
      </CodeBlock>
      <p>
        Add a Tigris S3 attachment for blob storage, point <code>VELLARIS_BLOB_S3_BUCKET</code> at
        it, set <code>VELLARIS_BLOB_BACKEND=s3</code>.
      </p>

      <h2>Railway</h2>
      <CodeBlock lang="shell">
        {`railway init --template ghcr.io/subhayu99/vellaris:latest
railway add --plugin postgresql
railway variables set VELLARIS_AUDIT_SIGNING_KEY="$(openssl rand -base64 32)"
railway up`}
      </CodeBlock>

      <h2>Behind a reverse proxy</h2>
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

      <h2>Backup</h2>
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
          The audit signing key (<code>VELLARIS_AUDIT_SIGNING_KEY</code>) must persist or existing
          audit log entries become unverifiable. Stash it in your secret store before going live.
        </span>
      </div>

      <h2>Health check</h2>
      <p>
        <code>GET /healthz</code> returns <code>{'{"status":"ok"}'}</code> when the DB is reachable.
        Use it as your liveness + readiness probe.
      </p>
    </DocsPageShell>
  )
}

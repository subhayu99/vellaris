import { ILogTree } from '../../marketing/icons.tsx'
import { DOCS_API, DOCS_PROTOCOL } from '../../marketing/links.ts'
import { CodeBlock } from '../code-block.tsx'
import { DocsPageShell } from '../page-shell.tsx'

export function ApiPage() {
  return (
    <DocsPageShell
      to={DOCS_API}
      title="OpenAPI."
      glyph={<ILogTree size={28} />}
      lead={
        <>
          Every Vellaris server publishes its full HTTP contract at <code>/openapi.json</code>.
          Point any OpenAPI tool at it and you have a typed client in your language of choice — no
          hand-rolled DTOs, no version drift.
        </>
      }
    >
      <h2>Where it lives</h2>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>What it serves</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>GET /openapi.json</code></td>
            <td>The machine-readable schema. FastAPI emits this.</td>
          </tr>
          <tr>
            <td><code>GET /docs</code></td>
            <td>Swagger UI bundled with the server.</td>
          </tr>
          <tr>
            <td><code>GET /redoc</code></td>
            <td>ReDoc rendering of the same schema.</td>
          </tr>
          <tr>
            <td><code>GET /healthz</code></td>
            <td>
              Liveness + readiness probe. Returns <code>{'{"status":"ok"}'}</code> when the DB
              is reachable.
            </td>
          </tr>
        </tbody>
      </table>

      <div className="docs-callout">
        <span className="label">Heads up</span>
        <span>
          The schema is generated per-deployment, so the URL you visit is your server&rsquo;s
          server — e.g. <code>https://vault.example.com/openapi.json</code>. There is no central
          registry; the schema is whatever code the server is running.
        </span>
      </div>

      <h2>Codegen example</h2>
      <p><code>openapi-typescript</code> turns the schema into a typed TS module:</p>
      <CodeBlock lang="shell">
        {`pnpm dlx openapi-typescript https://vault.example.com/openapi.json -o vellaris-types.ts`}
      </CodeBlock>
      <p>For a Python client:</p>
      <CodeBlock lang="shell">
        {`pipx run openapi-python-client generate \\
  --url https://vault.example.com/openapi.json`}
      </CodeBlock>
      <p>For Go:</p>
      <CodeBlock lang="shell">
        {`go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest \\
  -package vellaris \\
  https://vault.example.com/openapi.json > vellaris.go`}
      </CodeBlock>

      <h2>What codegen does NOT give you</h2>
      <p>
        The OpenAPI contract describes <strong>request/response shapes</strong>. It does not
        describe the encryption pipeline that turns a plaintext file into the bytes you put in{' '}
        <code>POST /documents</code>.
      </p>
      <p>
        For that, see the <a href={DOCS_PROTOCOL}>on-wire protocol</a> — the byte layouts you have
        to produce client-side before any HTTP request is made.
      </p>

      <h2>Auth</h2>
      <p>
        Every request after <code>POST /auth/verify</code> carries{' '}
        <code>Authorization: Bearer &lt;token&gt;</code>. Tokens are opaque and time-bounded;
        treat them as cookies. The full challenge flow is documented in the{' '}
        <a href={DOCS_PROTOCOL}>on-wire protocol</a>.
      </p>
    </DocsPageShell>
  )
}

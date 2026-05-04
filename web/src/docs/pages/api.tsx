import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ILogTree } from '../../marketing/icons.tsx'
import { DOCS_API, DOCS_PROTOCOL } from '../../marketing/links.ts'
import { DocsPageShell } from '../page-shell.tsx'
import { SnippetBox } from './install/components/SnippetBox'
import openapiJson from './api/openapi.json'
import type { OpenApiSchema } from './api/openapi-types'
import { parseOpenApi } from './api/parse-openapi'
import {
  decodeStateFromUrl,
  defaultApiBuilderState,
  encodeStateToUrl,
  type ApiBuilderState,
} from './api/state'
import { generateApiSnippet, bodyTemplateFor } from './api/templates'
import { EndpointList } from './api/components/EndpointList'
import { EndpointForm } from './api/components/EndpointForm'
import { LanguageTabs } from './api/components/LanguageTabs'
import './api/api.css'

const ENDPOINTS = parseOpenApi(openapiJson as unknown as OpenApiSchema)
const DEFAULT_OPERATION = ENDPOINTS[0]?.operationId ?? null

export function ApiPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [state, setState] = useState<ApiBuilderState>(() => {
    const initial = location.search ? decodeStateFromUrl(location.search) : defaultApiBuilderState
    if (!initial.selectedOperationId) initial.selectedOperationId = DEFAULT_OPERATION
    return initial
  })

  // Sync state → URL
  useEffect(() => {
    const newSearch = encodeStateToUrl(state)
    if (newSearch !== location.search) {
      navigate({ search: newSearch }, { replace: true })
    }
  }, [state, location.search, navigate])

  const selected =
    ENDPOINTS.find((e) => e.operationId === state.selectedOperationId) ?? ENDPOINTS[0]

  // When the selected endpoint changes, reset path/query/body to defaults for that endpoint
  // (otherwise filled values from previous endpoint stick around). This is a deliberate
  // sync: the form's *internal* state must follow the externally-selected endpoint,
  // and there's no derived-state alternative because the user edits these fields after.
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selected) return
    setState((prev) => ({
      ...prev,
      pathParams: {},
      queryParams: {},
      body: selected.requestBody ? bodyTemplateFor(selected.requestBody.schema) : '',
    }))
  }, [selected?.operationId])
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  const snippet = useMemo(() => {
    if (!selected) return ''
    return generateApiSnippet(selected, state, state.language)
  }, [selected, state])

  function patch(p: Partial<ApiBuilderState>) {
    setState((prev) => ({ ...prev, ...p }))
  }

  if (!selected) {
    return (
      <DocsPageShell to={DOCS_API} title="API." glyph={<ILogTree size={28} />}>
        <p>No endpoints found in the OpenAPI schema.</p>
      </DocsPageShell>
    )
  }

  return (
    <DocsPageShell
      to={DOCS_API}
      title="API."
      glyph={<ILogTree size={28} />}
      lead={
        <>
          Pick an endpoint, fill in the parameters, and copy a ready-to-run snippet in curl, Python,
          or JavaScript. The full schema is at <code>/openapi.json</code> on every server.
        </>
      }
    >
      <div className="api-playground">
        <EndpointList
          endpoints={ENDPOINTS}
          selectedOperationId={state.selectedOperationId}
          onSelect={(op) => setState((p) => ({ ...p, selectedOperationId: op }))}
        />

        <div className="api-playground-main">
          <EndpointForm endpoint={selected} state={state} onChange={patch} />
          <LanguageTabs
            value={state.language}
            onChange={(language) => setState((p) => ({ ...p, language }))}
          />
          <SnippetBox title={`Snippet (${state.language})`} contents={snippet} />
        </div>
      </div>

      <h2>Reference</h2>
      <p>
        Every Vellaris server publishes its full HTTP contract at <code>/openapi.json</code>. Point
        any OpenAPI tool at it and you have a typed client in your language of choice — no
        hand-rolled DTOs, no version drift.
      </p>
      <p>
        See also the <a href={DOCS_PROTOCOL}>protocol notes</a> for the cryptographic flow on top of
        the HTTP layer.
      </p>

      <h3>Codegen examples</h3>
      <p>
        <code>openapi-typescript</code> turns the schema into a typed TS module:
      </p>
      <pre>
        <code>{`pnpm dlx openapi-typescript https://vault.example.com/openapi.json -o vellaris-types.ts`}</code>
      </pre>
      <p>For a Python client:</p>
      <pre>
        <code>{`pipx run openapi-python-client generate \\
  --url https://vault.example.com/openapi.json`}</code>
      </pre>
      <p>For Go:</p>
      <pre>
        <code>{`go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest \\
  -package vellaris \\
  https://vault.example.com/openapi.json > vellaris.go`}</code>
      </pre>

      <h3>What codegen does not give you</h3>
      <p>
        The OpenAPI contract describes <strong>request/response shapes</strong>. It does not
        describe the encryption pipeline that turns a plaintext file into the bytes you put in{' '}
        <code>POST /documents</code>.
      </p>
      <p>
        For that, see the <a href={DOCS_PROTOCOL}>on-wire protocol</a> — the byte layouts you have
        to produce client-side before any HTTP request is made.
      </p>

      <h3>Auth</h3>
      <p>
        Every request after <code>POST /auth/verify</code> carries{' '}
        <code>Authorization: Bearer &lt;token&gt;</code>. Tokens are opaque and time-bounded; treat
        them as cookies. The full challenge flow is documented in the{' '}
        <a href={DOCS_PROTOCOL}>on-wire protocol</a>.
      </p>
    </DocsPageShell>
  )
}

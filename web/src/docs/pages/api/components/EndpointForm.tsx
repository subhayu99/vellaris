import type { EndpointSummary } from '../parse-openapi'
import type { ApiBuilderState } from '../state'
import { bodyTemplateFor } from '../templates'

interface Props {
  endpoint: EndpointSummary
  state: ApiBuilderState
  onChange: (patch: Partial<ApiBuilderState>) => void
}

export function EndpointForm({ endpoint, state, onChange }: Props) {
  return (
    <div className="api-endpoint-form">
      <div className="api-endpoint-header">
        <h3>
          <span className={`api-method api-method-${endpoint.method.toLowerCase()}`}>
            {endpoint.method}
          </span>
          <code>{endpoint.path}</code>
        </h3>
        {endpoint.summary && <p className="api-endpoint-summary">{endpoint.summary}</p>}
        {endpoint.description && <p className="api-endpoint-description">{endpoint.description}</p>}
      </div>

      <fieldset className="api-form-fieldset">
        <legend>Server</legend>
        <label>
          Server URL
          <input
            type="text"
            value={state.serverUrl}
            onChange={(e) => onChange({ serverUrl: e.target.value })}
          />
        </label>
        {endpoint.requiresAuth && (
          <label>
            Authorization token <span className="api-hint">(session token; not saved to URL)</span>
            <input
              type="password"
              value={state.authToken}
              onChange={(e) => onChange({ authToken: e.target.value })}
              placeholder="paste your bearer token here"
            />
          </label>
        )}
      </fieldset>

      {endpoint.pathParams.length > 0 && (
        <fieldset className="api-form-fieldset">
          <legend>Path parameters</legend>
          {endpoint.pathParams.map((p) => (
            <label key={p.name}>
              <span className="api-param-name">
                {p.name}
                {p.required && <span className="api-required">*</span>}
              </span>
              {p.description && <span className="api-hint">{p.description}</span>}
              <input
                type="text"
                value={state.pathParams[p.name] ?? ''}
                onChange={(e) =>
                  onChange({ pathParams: { ...state.pathParams, [p.name]: e.target.value } })
                }
              />
            </label>
          ))}
        </fieldset>
      )}

      {endpoint.queryParams.length > 0 && (
        <fieldset className="api-form-fieldset">
          <legend>Query parameters</legend>
          {endpoint.queryParams.map((p) => (
            <label key={p.name}>
              <span className="api-param-name">
                {p.name}
                {p.required && <span className="api-required">*</span>}
              </span>
              {p.description && <span className="api-hint">{p.description}</span>}
              <input
                type="text"
                value={state.queryParams[p.name] ?? ''}
                onChange={(e) =>
                  onChange({
                    queryParams: { ...state.queryParams, [p.name]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </fieldset>
      )}

      {endpoint.requestBody && (
        <fieldset className="api-form-fieldset">
          <legend>Request body ({endpoint.requestBody.contentType})</legend>
          {endpoint.requestBody.description && (
            <p className="api-hint">{endpoint.requestBody.description}</p>
          )}
          <textarea
            className="api-body-textarea"
            value={state.body}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder={bodyTemplateFor(endpoint.requestBody.schema)}
            rows={10}
            spellCheck={false}
          />
          <button
            type="button"
            className="api-fill-stub"
            onClick={() => onChange({ body: bodyTemplateFor(endpoint.requestBody?.schema) })}
          >
            Fill with stub
          </button>
        </fieldset>
      )}
    </div>
  )
}

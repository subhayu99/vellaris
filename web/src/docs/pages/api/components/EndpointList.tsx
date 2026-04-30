import type { EndpointSummary } from '../parse-openapi'
import { endpointsByTag } from '../parse-openapi'

interface Props {
  endpoints: readonly EndpointSummary[]
  selectedOperationId: string | null
  onSelect: (operationId: string) => void
}

const METHOD_CLASS: Record<string, string> = {
  GET: 'api-method-get',
  POST: 'api-method-post',
  PUT: 'api-method-put',
  DELETE: 'api-method-delete',
  PATCH: 'api-method-patch',
}

export function EndpointList({ endpoints, selectedOperationId, onSelect }: Props) {
  const grouped = endpointsByTag(endpoints)
  const tags = Object.keys(grouped).sort()
  return (
    <nav className="api-endpoint-list" aria-label="API endpoints">
      {tags.map((tag) => (
        <section key={tag} className="api-endpoint-group">
          <h3 className="api-endpoint-group-title">{tag}</h3>
          <ul>
            {grouped[tag].map((e) => (
              <li key={e.operationId}>
                <button
                  type="button"
                  className={`api-endpoint-item ${
                    selectedOperationId === e.operationId ? 'api-endpoint-item-active' : ''
                  }`}
                  onClick={() => onSelect(e.operationId)}
                >
                  <span className={`api-method ${METHOD_CLASS[e.method] ?? ''}`}>{e.method}</span>
                  <span className="api-path">{e.path}</span>
                  {e.summary && <span className="api-summary">{e.summary}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

import type { EndpointSummary } from './parse-openapi'
import type { ApiBuilderState, ApiLanguage } from './state'
import type { OpenApiSchemaObject } from './openapi-types'

/* Build a fully-substituted URL: server + path + filled path params + query string. */
function buildUrl(endpoint: EndpointSummary, state: ApiBuilderState): string {
  let path = endpoint.path
  for (const param of endpoint.pathParams) {
    const value = state.pathParams[param.name] ?? `<${param.name}>`
    path = path.replace(`{${param.name}}`, encodeURIComponent(value))
  }
  const qs = new URLSearchParams()
  for (const param of endpoint.queryParams) {
    const value = state.queryParams[param.name]
    if (value !== undefined && value !== '') qs.set(param.name, value)
  }
  const queryString = qs.toString()
  const base = state.serverUrl.replace(/\/$/, '')
  return `${base}${path}${queryString ? `?${queryString}` : ''}`
}

/* Best-effort JSON body. Returns the user's body if it parses; otherwise an
 * empty object. */
function parsedBody(state: ApiBuilderState): unknown {
  if (!state.body.trim()) return undefined
  try {
    return JSON.parse(state.body)
  } catch {
    return undefined
  }
}

/* Generate a placeholder JSON body from a request schema — used as the initial
 * value of the body textarea. */
export function bodyTemplateFor(schema: OpenApiSchemaObject | undefined): string {
  if (!schema || !schema.properties) return ''
  const stub: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema.properties)) {
    stub[k] = stubValue(v as OpenApiSchemaObject)
  }
  return JSON.stringify(stub, null, 2)
}

function stubValue(schema: OpenApiSchemaObject): unknown {
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.enum && schema.enum.length > 0) return schema.enum[0]
  switch (schema.type) {
    case 'string':
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000'
      if (schema.format === 'email') return 'user@example.com'
      if (schema.format === 'date-time') return '2024-01-01T00:00:00Z'
      if (schema.format === 'binary') return '...'
      return 'string'
    case 'integer':
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'array':
      return [stubValue(schema.items as OpenApiSchemaObject)]
    case 'object':
      if (schema.properties) {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(schema.properties)) {
          out[k] = stubValue(v as OpenApiSchemaObject)
        }
        return out
      }
      return {}
    default:
      return null
  }
}

/* === curl === */
export function generateCurlSnippet(endpoint: EndpointSummary, state: ApiBuilderState): string {
  const url = buildUrl(endpoint, state)
  const lines: string[] = [`curl -X ${endpoint.method} '${url}'`]
  const body = parsedBody(state)
  if (body !== undefined) {
    lines.push(`  -H 'Content-Type: application/json'`)
  }
  if (state.authToken) {
    lines.push(`  -H 'Authorization: Bearer ${state.authToken}'`)
  } else if (endpoint.requiresAuth) {
    lines.push(`  -H 'Authorization: Bearer <YOUR_SESSION_TOKEN>'`)
  }
  if (body !== undefined) {
    const bodyStr = JSON.stringify(body, null, 2)
    lines.push(`  -d '${bodyStr}'`)
  }
  return lines.join(' \\\n')
}

/* === Python (httpx) === */
export function generatePythonSnippet(endpoint: EndpointSummary, state: ApiBuilderState): string {
  const url = buildUrl(endpoint, state)
  const headers: string[] = []
  if (state.authToken) {
    headers.push(`"Authorization": "Bearer ${state.authToken}"`)
  } else if (endpoint.requiresAuth) {
    headers.push(`"Authorization": "Bearer <YOUR_SESSION_TOKEN>"`)
  }
  const body = parsedBody(state)
  const lines: string[] = ['import httpx', '']
  const methodLower = endpoint.method.toLowerCase()
  const args: string[] = [`"${url}"`]
  if (headers.length) {
    args.push(`headers={${headers.join(', ')}}`)
  }
  if (body !== undefined) {
    args.push(`json=${pythonRepr(body)}`)
  }
  lines.push(`response = httpx.${methodLower}(`)
  lines.push(...args.map((a, i) => `    ${a}${i < args.length - 1 ? ',' : ','}`))
  lines.push(`)`)
  lines.push(`response.raise_for_status()`)
  lines.push(`print(response.json())`)
  return lines.join('\n')
}

/* Convert a JS value to a Python repr (recursively). Uses Python conventions:
 * True/False/None, single quotes for strings (or double for safety), etc. */
function pythonRepr(value: unknown, indent = 0): string {
  const pad = '    '.repeat(indent)
  const padN = '    '.repeat(indent + 1)
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value) // double-quote, escape correctly
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map((v) => `${padN}${pythonRepr(v, indent + 1)}`).join(',\n')},\n${pad}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    return `{\n${entries
      .map(([k, v]) => `${padN}${JSON.stringify(k)}: ${pythonRepr(v, indent + 1)}`)
      .join(',\n')},\n${pad}}`
  }
  return JSON.stringify(value)
}

/* === JS (fetch) === */
export function generateJsSnippet(endpoint: EndpointSummary, state: ApiBuilderState): string {
  const url = buildUrl(endpoint, state)
  const headers: Record<string, string> = {}
  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`
  } else if (endpoint.requiresAuth) {
    headers.Authorization = 'Bearer <YOUR_SESSION_TOKEN>'
  }
  const body = parsedBody(state)
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const lines: string[] = []
  lines.push(`const response = await fetch("${url}", {`)
  lines.push(`  method: "${endpoint.method}",`)
  if (Object.keys(headers).length) {
    lines.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`)
  }
  if (body !== undefined) {
    lines.push(`  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, '\n  ')}),`)
  }
  lines.push(`});`)
  lines.push(`if (!response.ok) throw new Error(\`HTTP \${response.status}\`);`)
  lines.push(`const data = await response.json();`)
  lines.push(`console.log(data);`)
  return lines.join('\n')
}

/* === Top-level dispatch === */
export function generateApiSnippet(
  endpoint: EndpointSummary,
  state: ApiBuilderState,
  language: ApiLanguage,
): string {
  switch (language) {
    case 'curl':
      return generateCurlSnippet(endpoint, state)
    case 'python':
      return generatePythonSnippet(endpoint, state)
    case 'js':
      return generateJsSnippet(endpoint, state)
  }
}

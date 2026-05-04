/* API endpoint generator state. Persists in URL params for share-by-link.
 * The selected endpoint is identified by its operationId (stable across renames). */

export type ApiLanguage = 'curl' | 'python' | 'js'

export interface ApiBuilderState {
  selectedOperationId: string | null
  language: ApiLanguage
  serverUrl: string // e.g. https://vellaris.example.com
  pathParams: Record<string, string>
  queryParams: Record<string, string>
  body: string // raw JSON string the user is editing
  authToken: string // session token for endpoints that require auth
}

export const defaultApiBuilderState: ApiBuilderState = {
  selectedOperationId: null,
  language: 'curl',
  serverUrl: 'https://vellaris.example.com',
  pathParams: {},
  queryParams: {},
  body: '',
  authToken: '',
}

const LANGUAGES: ReadonlySet<ApiLanguage> = new Set(['curl', 'python', 'js'])

export function encodeStateToUrl(state: ApiBuilderState): string {
  const sp = new URLSearchParams()
  if (state.selectedOperationId) sp.set('op', state.selectedOperationId)
  if (state.language !== 'curl') sp.set('lang', state.language)
  if (state.serverUrl !== defaultApiBuilderState.serverUrl) sp.set('s', state.serverUrl)
  // pathParams + queryParams + body + authToken are NEVER serialized — could
  // contain sensitive values; users re-fill on each fresh URL load.
  return `?${sp.toString()}`
}

export function decodeStateFromUrl(search: string): ApiBuilderState {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const out: ApiBuilderState = { ...defaultApiBuilderState }
  const op = sp.get('op')
  if (op) out.selectedOperationId = op
  const lang = sp.get('lang')
  if (lang && LANGUAGES.has(lang as ApiLanguage)) out.language = lang as ApiLanguage
  const s = sp.get('s')
  if (s) out.serverUrl = s
  return out
}

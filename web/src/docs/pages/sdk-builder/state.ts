/* SDK starter generator state. URL-serialized for share-by-link. */

export type SdkRecipe = 'upload' | 'upload-and-share' | 'download' | 'list' | 'share' | 'revoke'
export type SdkVariant = 'async' | 'sync'

export interface SdkBuilderState {
  recipe: SdkRecipe
  variant: SdkVariant
  serverUrl: string
  username: string
  filePath?: string
  documentId?: string
  recipient?: string
}

export const defaultSdkBuilderState: SdkBuilderState = {
  recipe: 'upload',
  variant: 'async',
  serverUrl: 'https://vellaris.example.com',
  username: 'alice',
  filePath: 'document.pdf',
  documentId: '<document-uuid>',
  recipient: 'bob',
}

const RECIPES: ReadonlySet<SdkRecipe> = new Set([
  'upload', 'upload-and-share', 'download', 'list', 'share', 'revoke',
])
const VARIANTS: ReadonlySet<SdkVariant> = new Set(['async', 'sync'])

const URL_FIELDS: Record<string, keyof SdkBuilderState> = {
  r: 'recipe',
  v: 'variant',
  s: 'serverUrl',
  u: 'username',
  f: 'filePath',
  doc: 'documentId',
  to: 'recipient',
}

export function encodeStateToUrl(state: SdkBuilderState): string {
  const sp = new URLSearchParams()
  for (const [param, key] of Object.entries(URL_FIELDS)) {
    const v = state[key]
    if (v === undefined || v === '') continue
    if (defaultSdkBuilderState[key] === v) continue
    sp.set(param, String(v))
  }
  return `?${sp.toString()}`
}

export function decodeStateFromUrl(search: string): SdkBuilderState {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const out: SdkBuilderState = { ...defaultSdkBuilderState }
  for (const [param, key] of Object.entries(URL_FIELDS)) {
    const raw = sp.get(param)
    if (raw === null) continue
    if (key === 'recipe') {
      if (RECIPES.has(raw as SdkRecipe)) out.recipe = raw as SdkRecipe
    } else if (key === 'variant') {
      if (VARIANTS.has(raw as SdkVariant)) out.variant = raw as SdkVariant
    } else {
      ;(out[key] as string) = raw
    }
  }
  return out
}

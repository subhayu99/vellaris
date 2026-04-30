/* State for /docs/install. Persisted in URL query params (non-secrets only)
 * so configurations are bookmarkable/shareable. Credential values, when the
 * user opts into 'inline' mode, live in localStorage under a separate key
 * and NEVER touch the URL. */

export type RunMode = 'docker' | 'compose' | 'pip'
export type DbBackend = 'sqlite' | 'postgres' | 'mysql'
export type StorageBackend = 'local' | 's3' | 'gcs' | 'azure'
export type ImageVariant = 'slim' | 'full' | 'custom'
export type CredsMode = 'export' | 'inline'

export interface InstallState {
  runMode: RunMode
  db: DbBackend
  storage: StorageBackend
  image: ImageVariant

  // Non-secret config (panel inputs)
  bucket: string
  endpoint: string
  dbHost: string
  dbPort: string
  dbName: string
  dbUser: string

  // Credential mode
  credsMode: CredsMode
  // Inline credential values — lookup from localStorage, never URL
  credAwsAccessKeyId?: string
  credAwsSecretAccessKey?: string
  credAwsRegion?: string
  credDbPassword?: string
  credGcpKeyJsonPath?: string
  credAzureAccount?: string
  credAzureKey?: string
}

export const defaultInstallState: InstallState = {
  runMode: 'compose',
  db: 'postgres',
  storage: 'local',
  image: 'slim',
  bucket: 'vellaris-blobs',
  endpoint: '',
  dbHost: 'postgres',
  dbPort: '5432',
  dbName: 'vellaris',
  dbUser: 'vellaris',
  credsMode: 'export',
}

const RUN_MODES: ReadonlySet<RunMode> = new Set(['docker', 'compose', 'pip'])
const DBS: ReadonlySet<DbBackend> = new Set(['sqlite', 'postgres', 'mysql'])
const STORES: ReadonlySet<StorageBackend> = new Set(['local', 's3', 'gcs', 'azure'])
const IMAGES: ReadonlySet<ImageVariant> = new Set(['slim', 'full', 'custom'])

const CRED_KEYS: readonly (keyof InstallState)[] = [
  'credAwsAccessKeyId',
  'credAwsSecretAccessKey',
  'credAwsRegion',
  'credDbPassword',
  'credGcpKeyJsonPath',
  'credAzureAccount',
  'credAzureKey',
]

const URL_FIELDS: Record<string, keyof InstallState> = {
  run: 'runMode',
  db: 'db',
  store: 'storage',
  image: 'image',
  bucket: 'bucket',
  endpoint: 'endpoint',
  dbHost: 'dbHost',
  dbPort: 'dbPort',
  dbName: 'dbName',
  dbUser: 'dbUser',
  creds: 'credsMode',
}

export function encodeStateToUrl(state: InstallState): string {
  const sp = new URLSearchParams()
  for (const [param, key] of Object.entries(URL_FIELDS)) {
    if (CRED_KEYS.includes(key as keyof InstallState)) continue
    const v = state[key]
    if (v === undefined || v === '') continue
    sp.set(param, String(v))
  }
  return `?${sp.toString()}`
}

export function decodeStateFromUrl(search: string): InstallState {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const out = { ...defaultInstallState }
  for (const [param, key] of Object.entries(URL_FIELDS)) {
    const raw = sp.get(param)
    if (raw === null) continue
    if (key === 'runMode' && RUN_MODES.has(raw as RunMode)) out.runMode = raw as RunMode
    else if (key === 'db' && DBS.has(raw as DbBackend)) out.db = raw as DbBackend
    else if (key === 'storage' && STORES.has(raw as StorageBackend))
      out.storage = raw as StorageBackend
    else if (key === 'image' && IMAGES.has(raw as ImageVariant))
      out.image = raw as ImageVariant
    else if (key === 'credsMode' && (raw === 'export' || raw === 'inline'))
      out.credsMode = raw
    else if (key === 'bucket' || key === 'endpoint' || key === 'dbHost'
             || key === 'dbPort' || key === 'dbName' || key === 'dbUser') {
      ;(out[key] as string) = raw
    }
  }
  return out
}

const CRED_LS_KEY = 'vellaris-docs-install-creds'
const CFG_LS_KEY = 'vellaris-docs-install-config'

export function loadCredsFromLocalStorage(): Partial<InstallState> {
  try {
    const raw = localStorage.getItem(CRED_LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<InstallState> = {}
    for (const k of CRED_KEYS) {
      if (typeof parsed[k] === 'string') (out[k] as string) = parsed[k] as string
    }
    return out
  } catch {
    return {}
  }
}

export function saveCredsToLocalStorage(state: InstallState): void {
  const out: Record<string, string> = {}
  for (const k of CRED_KEYS) {
    const v = state[k]
    if (typeof v === 'string' && v.length) out[k] = v
  }
  if (Object.keys(out).length === 0) {
    localStorage.removeItem(CRED_LS_KEY)
    return
  }
  localStorage.setItem(CRED_LS_KEY, JSON.stringify(out))
}

export function loadConfigFromLocalStorage(): Partial<InstallState> {
  try {
    const raw = localStorage.getItem(CFG_LS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<InstallState>
  } catch {
    return {}
  }
}

export function saveConfigToLocalStorage(state: InstallState): void {
  const { /* strip creds */ ...rest } = state
  for (const k of CRED_KEYS) delete (rest as Record<string, unknown>)[k]
  localStorage.setItem(CFG_LS_KEY, JSON.stringify(rest))
}

export function forgetEverything(): void {
  localStorage.removeItem(CRED_LS_KEY)
  localStorage.removeItem(CFG_LS_KEY)
}

/* State for /docs/install. Persisted in URL query params (non-secrets only)
 * so configurations are bookmarkable/shareable. Credential values, when the
 * user opts into 'inline' mode, live in localStorage under a separate key
 * and NEVER touch the URL. */

export type RunMode = 'docker' | 'compose' | 'pip' | 'helm' | 'systemd'
export type DbBackend = 'sqlite' | 'postgres' | 'mysql'
export type StorageBackend = 'local' | 's3' | 'gcs' | 'azure'
export type ImageVariant = 'slim' | 'full' | 'custom'
export type CredsMode = 'export' | 'inline'
export type AuditKeyMode = 'generate' | 'path'
export type ProxyMode = 'none' | 'caddy' | 'nginx' | 'traefik'
export type TlsMode = 'off' | 'auto' | 'manual'

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

  // --- Advanced server config ---
  advancedOpen: boolean
  maxUploadMb: number
  rateLimitPerMin: number
  rateLimitBurst: number
  sessionTtlHours: number
  challengeTtlMin: number
  corsOrigins: string
  auditKeyMode: AuditKeyMode
  auditKeyPath: string
  autoMigrate: boolean
  replicas: number
  proxyMode: ProxyMode
  proxyHostname: string
  tlsMode: TlsMode
  tlsCertPath: string
  tlsKeyPath: string
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
  advancedOpen: false,
  maxUploadMb: 100,
  rateLimitPerMin: 120,
  rateLimitBurst: 20,
  sessionTtlHours: 8,
  challengeTtlMin: 5,
  corsOrigins: '*',
  auditKeyMode: 'generate',
  auditKeyPath: '/secrets/vellaris-audit-key',
  autoMigrate: true,
  replicas: 1,
  proxyMode: 'none',
  proxyHostname: 'vault.example.com',
  tlsMode: 'off',
  tlsCertPath: '/certs/cert.pem',
  tlsKeyPath: '/certs/key.pem',
}

const RUN_MODES: ReadonlySet<RunMode> = new Set(['docker', 'compose', 'pip', 'helm', 'systemd'])
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
  // existing
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
  // advanced
  adv: 'advancedOpen',
  mu: 'maxUploadMb',
  rpm: 'rateLimitPerMin',
  rb: 'rateLimitBurst',
  sttl: 'sessionTtlHours',
  cttl: 'challengeTtlMin',
  cors: 'corsOrigins',
  akm: 'auditKeyMode',
  akp: 'auditKeyPath',
  am: 'autoMigrate',
  rep: 'replicas',
  pmode: 'proxyMode',
  phost: 'proxyHostname',
  tmode: 'tlsMode',
  tcert: 'tlsCertPath',
  tkey: 'tlsKeyPath',
}

function isDefault(key: keyof InstallState, value: unknown): boolean {
  return defaultInstallState[key] === value
}

export function encodeStateToUrl(state: InstallState): string {
  const sp = new URLSearchParams()
  for (const [param, key] of Object.entries(URL_FIELDS)) {
    if (CRED_KEYS.includes(key as keyof InstallState)) continue
    const v = state[key]
    if (v === undefined || v === '') continue
    if (isDefault(key, v)) continue
    if (typeof v === 'boolean') {
      sp.set(param, v ? '1' : '0')
    } else if (typeof v === 'number') {
      sp.set(param, String(v))
    } else {
      sp.set(param, String(v))
    }
  }
  return `?${sp.toString()}`
}

const AUDIT_KEY_MODES: ReadonlySet<AuditKeyMode> = new Set(['generate', 'path'])
const PROXY_MODES: ReadonlySet<ProxyMode> = new Set(['none', 'caddy', 'nginx', 'traefik'])
const TLS_MODES: ReadonlySet<TlsMode> = new Set(['off', 'auto', 'manual'])

function parseBool(raw: string): boolean | null {
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return null
}

function parsePositiveInt(raw: string): number | null {
  const n = Number(raw)
  if (Number.isNaN(n)) return null
  return Math.max(1, Math.round(n))
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
    // --- Advanced boolean fields ---
    else if (key === 'advancedOpen') {
      const b = parseBool(raw)
      if (b !== null) out.advancedOpen = b
    }
    else if (key === 'autoMigrate') {
      const b = parseBool(raw)
      if (b !== null) out.autoMigrate = b
    }
    // --- Advanced numeric fields ---
    else if (key === 'maxUploadMb') {
      const n = parsePositiveInt(raw)
      if (n !== null) out.maxUploadMb = n
    }
    else if (key === 'rateLimitPerMin') {
      const n = parsePositiveInt(raw)
      if (n !== null) out.rateLimitPerMin = n
    }
    else if (key === 'rateLimitBurst') {
      const n = parsePositiveInt(raw)
      if (n !== null) out.rateLimitBurst = n
    }
    else if (key === 'sessionTtlHours') {
      const n = parsePositiveInt(raw)
      if (n !== null) out.sessionTtlHours = n
    }
    else if (key === 'challengeTtlMin') {
      const n = parsePositiveInt(raw)
      if (n !== null) out.challengeTtlMin = n
    }
    else if (key === 'replicas') {
      const n = parsePositiveInt(raw)
      if (n !== null) out.replicas = n
    }
    // --- Advanced enum fields ---
    else if (key === 'auditKeyMode' && AUDIT_KEY_MODES.has(raw as AuditKeyMode))
      out.auditKeyMode = raw as AuditKeyMode
    else if (key === 'proxyMode' && PROXY_MODES.has(raw as ProxyMode))
      out.proxyMode = raw as ProxyMode
    else if (key === 'tlsMode' && TLS_MODES.has(raw as TlsMode))
      out.tlsMode = raw as TlsMode
    // --- Advanced free-string fields ---
    else if (key === 'corsOrigins') out.corsOrigins = raw
    else if (key === 'auditKeyPath') out.auditKeyPath = raw
    else if (key === 'proxyHostname') out.proxyHostname = raw
    else if (key === 'tlsCertPath') out.tlsCertPath = raw
    else if (key === 'tlsKeyPath') out.tlsKeyPath = raw
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

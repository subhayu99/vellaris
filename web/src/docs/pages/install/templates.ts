import type { DbBackend, InstallState, StorageBackend } from './state'

const SLIM_BASE_TAG = (v: string) => `ghcr.io/subhayu99/vellaris:${v}`
const FULL_BASE_TAG = (v: string) => `ghcr.io/subhayu99/vellaris:${v}-full`

const DB_DRIVER: Record<DbBackend, string> = {
  sqlite: 'sqlite+aiosqlite',
  postgres: 'postgresql+asyncpg',
  mysql: 'mysql+asyncmy',
}

const PIP_EXTRAS_FOR_DB: Record<DbBackend, string | null> = {
  sqlite: 'sqlite',
  postgres: 'postgres',
  mysql: 'mysql',
}

const PIP_EXTRAS_FOR_STORAGE: Record<StorageBackend, string | null> = {
  local: null,
  s3: 's3',
  gcs: 'gcs',
  azure: 'azure',
}

function pipExtras(s: InstallState): string[] {
  const out = ['server']
  const db = PIP_EXTRAS_FOR_DB[s.db]
  const sto = PIP_EXTRAS_FOR_STORAGE[s.storage]
  if (db) out.push(db)
  if (sto) out.push(sto)
  return out
}

export function generateDatabaseUrl(s: InstallState): string {
  const driver = DB_DRIVER[s.db]
  if (s.db === 'sqlite') return `${driver}:////data/vellaris.db`
  const password = s.credsMode === 'inline' ? s.credDbPassword || '...' : '${DB_PASSWORD}'
  return `${driver}://${s.dbUser}:${password}@${s.dbHost}:${s.dbPort}/${s.dbName}`
}

function generateBlobUrl(s: InstallState): string {
  switch (s.storage) {
    case 'local':
      return 'file:///data/blobs'
    case 's3':
      return `s3://${s.bucket || 'my-bucket'}`
    case 'gcs':
      return `gs://${s.bucket || 'my-bucket'}`
    case 'azure':
      return `az://${s.bucket || 'my-container'}`
  }
}

function imageTag(s: InstallState, version: string): string {
  return s.image === 'full' ? FULL_BASE_TAG(version) : SLIM_BASE_TAG(version)
}

/**
 * Pick the WebAuthn Relying Party ID for this deployment.
 *
 * Preference order:
 *   1. Explicit ``webauthnSpaHost`` — used when the SPA lives on a
 *      different domain than the API (e.g. SPA at vellaris.example.com,
 *      API at api.vellaris.example.com).
 *   2. ``proxyHostname`` when a reverse proxy is configured — the common
 *      case where SPA + API share a single hostname behind one proxy.
 *
 * Returns null when neither is set: in that case we don't emit
 * VELLARIS_WEBAUTHN_RP_* env vars and the server falls back to its
 * localhost defaults (correct for local dev, broken for any real
 * deployment — operators get a startup warning to nudge them).
 */
function resolveWebAuthnHost(s: InstallState): string | null {
  const explicit = s.webauthnSpaHost.trim()
  if (explicit) return explicit
  if (s.proxyMode !== 'none' && s.proxyHostname && s.proxyHostname !== 'vault.example.com') {
    return s.proxyHostname
  }
  return null
}

function advancedEnvVars(s: InstallState): Record<string, string> {
  const out: Record<string, string> = {}
  if (s.maxUploadMb !== 100) out.VELLARIS_MAX_UPLOAD_BYTES = String(s.maxUploadMb * 1024 * 1024)
  if (s.rateLimitPerMin !== 120) out.VELLARIS_RATE_LIMIT_PER_MINUTE = String(s.rateLimitPerMin)
  if (s.rateLimitBurst !== 20) out.VELLARIS_RATE_LIMIT_BURST = String(s.rateLimitBurst)
  if (s.sessionTtlHours !== 8) out.VELLARIS_SESSION_TTL_SECONDS = String(s.sessionTtlHours * 3600)
  if (s.challengeTtlMin !== 5) out.VELLARIS_CHALLENGE_TTL_SECONDS = String(s.challengeTtlMin * 60)
  if (s.corsOrigins !== '*')
    out.VELLARIS_CORS_ALLOW_ORIGINS = s.corsOrigins
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .join(',')
  if (s.auditKeyMode === 'path') out.VELLARIS_AUDIT_SIGNING_KEY_PATH = s.auditKeyPath
  if (!s.autoMigrate) out.VELLARIS_AUTO_MIGRATE = '0'

  const rpHost = resolveWebAuthnHost(s)
  if (rpHost) {
    out.VELLARIS_WEBAUTHN_RP_ID = rpHost
    out.VELLARIS_WEBAUTHN_RP_ORIGINS = `https://${rpHost}`
  }
  return out
}

export function generateExportBlock(s: InstallState, _version: string): string {
  if (s.credsMode === 'inline') return '' // inline creds handled in run snippet directly
  const lines: string[] = []
  if (s.db !== 'sqlite') lines.push('export DB_PASSWORD="..."  # your DB password')
  if (s.storage === 's3') {
    lines.push('export AWS_ACCESS_KEY_ID="..."           # IAM access key')
    lines.push('export AWS_SECRET_ACCESS_KEY="..."       # IAM secret')
    lines.push('export AWS_REGION="us-east-1"            # bucket region')
    if (s.endpoint) {
      lines.push(`export VELLARIS_BLOB_OPTIONS_JSON='{"endpoint_url":"${s.endpoint}"}'`)
    }
  } else if (s.storage === 'gcs') {
    lines.push('export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json')
  } else if (s.storage === 'azure') {
    lines.push('export AZURE_STORAGE_ACCOUNT_NAME="..."')
    lines.push('export AZURE_STORAGE_ACCOUNT_KEY="..."')
  }
  return lines.length ? `# Set credentials in your shell first\n${lines.join('\n')}` : ''
}

function dockerEnvFlags(s: InstallState): string[] {
  const flags = [
    `-e VELLARIS_DATABASE_URL='${generateDatabaseUrl(s)}'`,
    `-e VELLARIS_BLOB_URL=${generateBlobUrl(s)}`,
  ]
  if (s.credsMode === 'export') {
    if (s.db !== 'sqlite') flags.push('-e DB_PASSWORD')
    if (s.storage === 's3') {
      flags.push('-e AWS_ACCESS_KEY_ID', '-e AWS_SECRET_ACCESS_KEY', '-e AWS_REGION')
      if (s.endpoint) flags.push('-e VELLARIS_BLOB_OPTIONS_JSON')
    } else if (s.storage === 'gcs') {
      flags.push(
        '-e GOOGLE_APPLICATION_CREDENTIALS',
        '-v "$GOOGLE_APPLICATION_CREDENTIALS:/secrets/sa.json:ro"',
      )
    } else if (s.storage === 'azure') {
      flags.push('-e AZURE_STORAGE_ACCOUNT_NAME', '-e AZURE_STORAGE_ACCOUNT_KEY')
    }
  } else {
    if (s.db !== 'sqlite') flags.push(`-e DB_PASSWORD=${s.credDbPassword || '...'}`)
    if (s.storage === 's3') {
      flags.push(
        `-e AWS_ACCESS_KEY_ID=${s.credAwsAccessKeyId || '...'}`,
        `-e AWS_SECRET_ACCESS_KEY=${s.credAwsSecretAccessKey || '...'}`,
        `-e AWS_REGION=${s.credAwsRegion || 'us-east-1'}`,
      )
    }
  }
  for (const [k, v] of Object.entries(advancedEnvVars(s))) {
    flags.push(`-e ${k}='${v}'`)
  }
  if (s.storage === 'local') flags.push('-v vellaris-blobs:/data/blobs')
  if (s.db === 'sqlite') flags.push('-v vellaris-db:/data')
  return flags
}

function generateDockerRun(s: InstallState, version: string): string {
  const flags = dockerEnvFlags(s)
    .map((l) => `  ${l} \\`)
    .join('\n')
  return [
    `docker run -d --name vellaris \\`,
    `  -p 8000:8000 \\`,
    flags,
    `  ${imageTag(s, version)}`,
  ].join('\n')
}

function generateCustomDockerfile(s: InstallState, version: string): string {
  const extras = pipExtras(s)
    .filter((e) => e !== 'server')
    .join(',')
  const runBlock = generateDockerRun({ ...s, image: 'slim' }, version).replace(
    imageTag({ ...s, image: 'slim' }, version),
    'my-vellaris',
  )
  // Indent the docker run continuation lines under the && so it reads as one chain
  const chainedRun = runBlock.replace(/^docker run/, '  && docker run')
  return [
    `# Copy-paste this whole block.`,
    `cat > Dockerfile <<'EOF'`,
    `FROM ${SLIM_BASE_TAG(version)}`,
    `RUN pip install --no-cache-dir 'vellaris[${extras}]==${version}'`,
    `EOF`,
    `docker build -t my-vellaris . \\`,
    chainedRun,
  ].join('\n')
}

function generateCompose(s: InstallState, version: string): string {
  const inline = s.credsMode === 'inline'
  const dbPwValue = inline ? s.credDbPassword || '...' : '${DB_PASSWORD}'
  const awsKeyId = inline ? s.credAwsAccessKeyId || '...' : '${AWS_ACCESS_KEY_ID}'
  const awsSecret = inline ? s.credAwsSecretAccessKey || '...' : '${AWS_SECRET_ACCESS_KEY}'
  const awsRegion = inline ? s.credAwsRegion || 'us-east-1' : '${AWS_REGION:-us-east-1}'

  const advYaml = Object.entries(advancedEnvVars(s)).map(
    ([k, v]) => `      ${k}: '${v.replace(/'/g, "''")}'`,
  )

  const deployBlock =
    s.replicas > 1
      ? [
          `    deploy:`,
          `      replicas: ${s.replicas}`,
          `      restart_policy:`,
          `        condition: on-failure`,
        ]
      : []

  const services: string[] = []
  services.push(
    [
      '  vellaris:',
      `    image: ${imageTag(s, version)}`,
      `    ports:`,
      `      - "8000:8000"`,
      `    environment:`,
      `      VELLARIS_DATABASE_URL: ${generateDatabaseUrl(s)}`,
      `      VELLARIS_BLOB_URL: ${generateBlobUrl(s)}`,
      ...(s.db !== 'sqlite' ? [`      DB_PASSWORD: ${dbPwValue}`] : []),
      ...(s.storage === 's3'
        ? [
            `      AWS_ACCESS_KEY_ID: ${awsKeyId}`,
            `      AWS_SECRET_ACCESS_KEY: ${awsSecret}`,
            `      AWS_REGION: ${awsRegion}`,
          ]
        : []),
      ...advYaml,
      ...deployBlock,
      ...(s.storage === 'local' ? [`    volumes:`, `      - vellaris-blobs:/data/blobs`] : []),
    ].join('\n'),
  )
  if (s.db === 'postgres') {
    services.push(
      [
        '  postgres:',
        '    image: postgres:16-alpine',
        '    environment:',
        `      POSTGRES_USER: ${s.dbUser}`,
        `      POSTGRES_DB: ${s.dbName}`,
        `      POSTGRES_PASSWORD: ${dbPwValue}`,
        '    volumes:',
        '      - postgres-data:/var/lib/postgresql/data',
        '    healthcheck:',
        `      test: ["CMD-SHELL", "pg_isready -U ${s.dbUser}"]`,
        '      interval: 5s',
      ].join('\n'),
    )
  } else if (s.db === 'mysql') {
    services.push(
      [
        '  mysql:',
        '    image: mariadb:11',
        '    environment:',
        `      MARIADB_USER: ${s.dbUser}`,
        `      MARIADB_DATABASE: ${s.dbName}`,
        `      MARIADB_PASSWORD: ${dbPwValue}`,
        `      MARIADB_ROOT_PASSWORD: ${dbPwValue}`,
        '    volumes:',
        '      - mysql-data:/var/lib/mysql',
      ].join('\n'),
    )
  }
  const volumes: string[] = []
  if (s.db === 'postgres') volumes.push('  postgres-data:')
  if (s.db === 'mysql') volumes.push('  mysql-data:')
  if (s.storage === 'local') volumes.push('  vellaris-blobs:')
  return [
    `# Save as compose.yaml, then: docker compose up -d`,
    `services:`,
    services.join('\n\n'),
    ``,
    ...(volumes.length ? [`volumes:`, volumes.join('\n')] : []),
  ].join('\n')
}

function generatePip(s: InstallState, version: string): string {
  const extras = pipExtras(s).join(',')
  const url = generateDatabaseUrl(s)
  const blob = generateBlobUrl(s)
  const dbPwValue = s.credsMode === 'inline' ? s.credDbPassword || '...' : '...'
  return [
    `pip install 'vellaris[${extras}]==${version}'`,
    ``,
    `# Save as .env (alongside your run dir):`,
    `VELLARIS_DATABASE_URL=${url}`,
    `VELLARIS_BLOB_URL=${blob}`,
    ...(s.db !== 'sqlite' ? [`DB_PASSWORD=${dbPwValue}`] : []),
    ...Object.entries(advancedEnvVars(s)).map(([k, v]) => `${k}=${v}`),
    ``,
    `# Run:`,
    `vellaris-server`,
  ].join('\n')
}

function generateHelm(s: InstallState, version: string): string {
  const dbUrl = generateDatabaseUrl(s)
  const blobUrl = generateBlobUrl(s)
  const variant = s.image === 'full' ? 'full' : 'slim'
  const env: Record<string, string> = {
    VELLARIS_DATABASE_URL: dbUrl,
    VELLARIS_BLOB_URL: blobUrl,
    ...advancedEnvVars(s),
  }
  const envBlock = Object.entries(env)
    .map(([k, v]) => `  ${k}: '${v.replace(/'/g, "''")}'`)
    .join('\n')
  return [
    `# vellaris values.yaml — pair with: helm install vellaris vellaris/vellaris -f values.yaml`,
    `# (Vellaris Helm chart is shipped at github.com/subhayu99/vellaris/tree/main/deploy/helm)`,
    ``,
    `image:`,
    `  repository: ghcr.io/subhayu99/vellaris`,
    `  tag: '${version}${variant === 'full' ? '-full' : ''}'`,
    `  pullPolicy: IfNotPresent`,
    ``,
    `replicaCount: ${s.replicas}`,
    ``,
    `env:`,
    envBlock,
    ``,
    ...(s.db === 'postgres'
      ? [
          `postgres:`,
          `  enabled: true`,
          `  auth:`,
          `    username: ${s.dbUser}`,
          `    database: ${s.dbName}`,
          ``,
        ]
      : []),
    ...(s.db === 'mysql'
      ? [
          `mysql:`,
          `  enabled: true`,
          `  auth:`,
          `    username: ${s.dbUser}`,
          `    database: ${s.dbName}`,
          ``,
        ]
      : []),
    `ingress:`,
    `  enabled: ${s.proxyMode !== 'none' ? 'true' : 'false'}`,
    ...(s.proxyMode !== 'none'
      ? [`  hosts:`, `    - host: ${s.proxyHostname}`, `      paths: [/]`]
      : []),
    ``,
    `resources:`,
    `  requests:`,
    `    cpu: 250m`,
    `    memory: 512Mi`,
    `  limits:`,
    `    cpu: 1000m`,
    `    memory: 1Gi`,
  ].join('\n')
}

function generateSystemd(s: InstallState, version: string): string {
  const env: Record<string, string> = {
    VELLARIS_DATABASE_URL: generateDatabaseUrl(s),
    VELLARIS_BLOB_URL: generateBlobUrl(s),
    ...advancedEnvVars(s),
  }
  const envLines = Object.entries(env).map(([k, v]) => `Environment="${k}=${v}"`)
  const extras = pipExtras(s)
    .filter((e) => e !== 'server')
    .join(',')
  const pipExtraSpec = extras ? `[server,${extras}]` : '[server]'
  return [
    `# 1. Install vellaris from PyPI:`,
    `#   pip install 'vellaris${pipExtraSpec}==${version}'`,
    `#`,
    `# 2. Save this file to /etc/systemd/system/vellaris.service`,
    `#`,
    `# 3. Reload + start:`,
    `#   sudo systemctl daemon-reload`,
    `#   sudo systemctl enable --now vellaris`,
    ``,
    `[Unit]`,
    `Description=Vellaris (E2E encrypted document sharing)`,
    `After=network.target`,
    ``,
    `[Service]`,
    `Type=exec`,
    `User=vellaris`,
    `Group=vellaris`,
    `WorkingDirectory=/var/lib/vellaris`,
    ...envLines,
    `ExecStart=/usr/local/bin/vellaris-server`,
    `Restart=on-failure`,
    `RestartSec=5`,
    ``,
    `[Install]`,
    `WantedBy=multi-user.target`,
  ].join('\n')
}

export interface ProxySnippet {
  title: string
  contents: string
}

export function generateProxySnippet(s: InstallState): ProxySnippet | null {
  if (s.proxyMode === 'none') return null
  if (s.proxyMode === 'caddy') {
    return {
      title: 'Reverse proxy (Caddyfile)',
      contents: [
        `# Save as /etc/caddy/Caddyfile`,
        `${s.proxyHostname} {`,
        `  reverse_proxy 127.0.0.1:8000`,
        `}`,
      ].join('\n'),
    }
  }
  if (s.proxyMode === 'nginx') {
    const isManual = s.tlsMode === 'manual'
    return {
      title: 'Reverse proxy (nginx)',
      contents: [
        `# Save as /etc/nginx/sites-available/vellaris`,
        `server {`,
        `  listen 443 ssl http2;`,
        `  server_name ${s.proxyHostname};`,
        ...(isManual
          ? [`  ssl_certificate ${s.tlsCertPath};`, `  ssl_certificate_key ${s.tlsKeyPath};`]
          : [
              `  # ssl_certificate /path/to/cert.pem;`,
              `  # ssl_certificate_key /path/to/key.pem;`,
            ]),
        `  location / {`,
        `    proxy_pass http://127.0.0.1:8000;`,
        `    proxy_set_header Host $host;`,
        `    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
        `  }`,
        `}`,
      ].join('\n'),
    }
  }
  // traefik
  return {
    title: 'Reverse proxy (Traefik labels — add to your service in compose)',
    contents: [
      `labels:`,
      `  - "traefik.enable=true"`,
      `  - "traefik.http.routers.vellaris.rule=Host(\`${s.proxyHostname}\`)"`,
      `  - "traefik.http.routers.vellaris.tls.certresolver=letsencrypt"`,
      `  - "traefik.http.services.vellaris.loadbalancer.server.port=8000"`,
    ].join('\n'),
  }
}

export function generateRunSnippet(s: InstallState, version: string): string {
  if (s.image === 'custom') return generateCustomDockerfile(s, version)
  if (s.runMode === 'docker') return generateDockerRun(s, version)
  if (s.runMode === 'compose') return generateCompose(s, version)
  if (s.runMode === 'helm') return generateHelm(s, version)
  if (s.runMode === 'systemd') return generateSystemd(s, version)
  return generatePip(s, version)
}

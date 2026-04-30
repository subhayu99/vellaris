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
  return `${driver}://${s.dbUser}:\${DB_PASSWORD}@${s.dbHost}:${s.dbPort}/${s.dbName}`
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
  if (s.storage === 'local') flags.push('-v vellaris-blobs:/data/blobs')
  if (s.db === 'sqlite') flags.push('-v vellaris-db:/data')
  return flags
}

function generateDockerRun(s: InstallState, version: string): string {
  const flags = dockerEnvFlags(s).map((l) => `  ${l} \\`).join('\n')
  return [
    `docker run -d --name vellaris \\`,
    `  -p 8000:8000 \\`,
    flags,
    `  ${imageTag(s, version)}`,
  ].join('\n')
}

function generateCustomDockerfile(s: InstallState, version: string): string {
  const extras = pipExtras(s).filter((e) => e !== 'server').join(',')
  return [
    `# Save as Dockerfile`,
    `FROM ${SLIM_BASE_TAG(version)}`,
    `RUN pip install --no-cache-dir 'vellaris[${extras}]==${version}'`,
    ``,
    `# Build:`,
    `#   docker build -t my-vellaris .`,
    ``,
    `# Then run:`,
    generateDockerRun({ ...s, image: 'slim' }, version).replace(
      imageTag({ ...s, image: 'slim' }, version),
      'my-vellaris',
    ),
  ].join('\n')
}

function generateCompose(s: InstallState, version: string): string {
  const services: string[] = []
  services.push(
    [
      '  vellaris:',
      `    image: ${imageTag(s, version)}`,
      `    ports:`,
      `      - "8000:8000"`,
      `    environment:`,
      `      VELLARIS_DATABASE_URL: ${generateDatabaseUrl(s).replace('\${DB_PASSWORD}', '\${DB_PASSWORD}')}`,
      `      VELLARIS_BLOB_URL: ${generateBlobUrl(s)}`,
      ...(s.db !== 'sqlite' ? [`      DB_PASSWORD: \${DB_PASSWORD}`] : []),
      ...(s.storage === 's3'
        ? [
            `      AWS_ACCESS_KEY_ID: \${AWS_ACCESS_KEY_ID}`,
            `      AWS_SECRET_ACCESS_KEY: \${AWS_SECRET_ACCESS_KEY}`,
            `      AWS_REGION: \${AWS_REGION:-us-east-1}`,
          ]
        : []),
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
        `      POSTGRES_PASSWORD: \${DB_PASSWORD}`,
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
        `      MARIADB_PASSWORD: \${DB_PASSWORD}`,
        `      MARIADB_ROOT_PASSWORD: \${DB_PASSWORD}`,
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
  return [
    `pip install 'vellaris[${extras}]==${version}'`,
    ``,
    `# Save as .env (alongside your run dir):`,
    `VELLARIS_DATABASE_URL=${url}`,
    `VELLARIS_BLOB_URL=${blob}`,
    ...(s.db !== 'sqlite' ? [`DB_PASSWORD=...`] : []),
    ``,
    `# Run:`,
    `vellaris-server`,
  ].join('\n')
}

export function generateRunSnippet(s: InstallState, version: string): string {
  if (s.image === 'custom') return generateCustomDockerfile(s, version)
  if (s.runMode === 'docker') return generateDockerRun(s, version)
  if (s.runMode === 'compose') return generateCompose(s, version)
  return generatePip(s, version)
}

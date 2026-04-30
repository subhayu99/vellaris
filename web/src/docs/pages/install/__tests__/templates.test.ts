import { describe, expect, it } from 'vitest'
import { defaultInstallState, type InstallState } from '../state'
import {
  generateDatabaseUrl,
  generateExportBlock,
  generateRunSnippet,
} from '../templates'

const VERSION = '0.5.0'

const sqliteLocalSlim: InstallState = {
  ...defaultInstallState,
  runMode: 'docker',
  db: 'sqlite',
  storage: 'local',
  image: 'slim',
}

const postgresS3Full: InstallState = {
  ...defaultInstallState,
  runMode: 'compose',
  db: 'postgres',
  storage: 's3',
  image: 'full',
  bucket: 'my-blobs',
}

describe('generateDatabaseUrl', () => {
  it('builds sqlite URL', () => {
    expect(generateDatabaseUrl(sqliteLocalSlim)).toBe('sqlite+aiosqlite:////data/vellaris.db')
  })

  it('builds postgres URL with shell-substituted password', () => {
    const url = generateDatabaseUrl(postgresS3Full)
    expect(url).toContain('postgresql+asyncpg://')
    expect(url).toContain('${DB_PASSWORD}')
    expect(url).toContain('@postgres:5432/vellaris')
  })
})

describe('generateExportBlock', () => {
  it('omits export block when no credentials needed', () => {
    expect(generateExportBlock(sqliteLocalSlim, VERSION)).toBe('')
  })

  it('includes AWS + DB password exports for postgres+s3', () => {
    const exp = generateExportBlock(postgresS3Full, VERSION)
    expect(exp).toContain('AWS_ACCESS_KEY_ID')
    expect(exp).toContain('AWS_SECRET_ACCESS_KEY')
    expect(exp).toContain('DB_PASSWORD')
  })
})

describe('generateRunSnippet — docker', () => {
  it('produces a sensible docker run for sqlite+local+slim', () => {
    const out = generateRunSnippet(sqliteLocalSlim, VERSION)
    expect(out).toContain('docker run')
    expect(out).toContain(`ghcr.io/subhayu99/vellaris:${VERSION}`)
    expect(out).toContain('VELLARIS_DATABASE_URL')
    expect(out).toContain('VELLARIS_BLOB_URL=file:///data/blobs')
  })

  it('uses :VERSION-full tag when image=full', () => {
    const out = generateRunSnippet(postgresS3Full, VERSION)
    expect(out).toContain(`ghcr.io/subhayu99/vellaris:${VERSION}-full`)
  })

  it('uses pass-through (-e VAR) for credential env vars', () => {
    const exp = { ...postgresS3Full, runMode: 'docker' as const }
    const out = generateRunSnippet(exp, VERSION)
    // Bare -e AWS_ACCESS_KEY_ID without =value means pass-through
    expect(out).toMatch(/-e AWS_ACCESS_KEY_ID(?!=)/)
  })
})

describe('generateRunSnippet — compose', () => {
  it('emits a compose YAML with vellaris + postgres services', () => {
    const out = generateRunSnippet(postgresS3Full, VERSION)
    expect(out).toContain('services:')
    expect(out).toContain('vellaris:')
    expect(out).toContain('postgres:')
    expect(out).toContain('image: ghcr.io/subhayu99/vellaris:0.5.0-full')
  })
})

describe('generateRunSnippet — pip', () => {
  it('emits pip install + .env + run command', () => {
    const pip: InstallState = { ...postgresS3Full, runMode: 'pip', image: 'slim' }
    const out = generateRunSnippet(pip, VERSION)
    expect(out).toContain('pip install')
    expect(out).toContain('vellaris[server,postgres,s3]==0.5.0')
    expect(out).toContain('vellaris-server')
  })
})

describe('generateRunSnippet — custom image', () => {
  it('emits a Dockerfile + build + run', () => {
    const custom: InstallState = { ...postgresS3Full, image: 'custom', runMode: 'docker' }
    const out = generateRunSnippet(custom, VERSION)
    expect(out).toContain('FROM ghcr.io/subhayu99/vellaris:0.5.0')
    expect(out).toContain("pip install --no-cache-dir 'vellaris[postgres,s3]==0.5.0'")
    expect(out).toContain('docker build')
  })
})

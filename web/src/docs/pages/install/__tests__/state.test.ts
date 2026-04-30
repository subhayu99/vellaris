import { describe, expect, it } from 'vitest'
import {
  decodeStateFromUrl,
  encodeStateToUrl,
  defaultInstallState,
  type InstallState,
} from '../state'

describe('install state codec', () => {
  it('round-trips defaults to a clean URL', () => {
    const url = encodeStateToUrl(defaultInstallState)
    const decoded = decodeStateFromUrl(url)
    expect(decoded).toEqual(defaultInstallState)
  })

  it('encodes a custom config compactly', () => {
    const state: InstallState = {
      ...defaultInstallState,
      runMode: 'docker',
      db: 'mysql',
      storage: 's3',
      image: 'full',
      bucket: 'my-bucket',
      dbHost: 'pg.internal',
      credsMode: 'inline',
    }
    const url = encodeStateToUrl(state)
    expect(url).toContain('run=docker')
    expect(url).toContain('db=mysql')
    expect(url).toContain('store=s3')
    expect(url).toContain('image=full')
    expect(url).toContain('bucket=my-bucket')
  })

  it('falls back to defaults on garbage input', () => {
    const decoded = decodeStateFromUrl('?run=invalid&db=cassandra')
    expect(decoded.runMode).toBe(defaultInstallState.runMode)
    expect(decoded.db).toBe(defaultInstallState.db)
  })

  it('never serializes credential values', () => {
    const state: InstallState = {
      ...defaultInstallState,
      credsMode: 'inline',
      credAwsAccessKeyId: 'AKIA-SUPER-SECRET',
      credAwsSecretAccessKey: 'super-secret-value',
    }
    const url = encodeStateToUrl(state)
    expect(url).not.toContain('AKIA')
    expect(url).not.toContain('super-secret')
  })

  it('round-trips advanced fields', () => {
    const state: InstallState = {
      ...defaultInstallState,
      advancedOpen: true,
      maxUploadMb: 500,
      rateLimitPerMin: 60,
      rateLimitBurst: 10,
      sessionTtlHours: 24,
      challengeTtlMin: 10,
      corsOrigins: 'https://app.example.com,https://admin.example.com',
      auditKeyMode: 'path',
      auditKeyPath: '/var/lib/secrets/audit-key',
      autoMigrate: false,
      replicas: 3,
      proxyMode: 'caddy',
      proxyHostname: 'vault.example.com',
      tlsMode: 'manual',
      tlsCertPath: '/certs/cert.pem',
      tlsKeyPath: '/certs/key.pem',
    }
    const url = encodeStateToUrl(state)
    const decoded = decodeStateFromUrl(url)
    expect(decoded).toEqual(state)
  })

  it('omits default fields from URL to keep it compact', () => {
    const url = encodeStateToUrl(defaultInstallState)
    // URL should be minimal — no fields unless explicitly non-default.
    // The query string after the leading "?" should be very short or empty.
    const params = new URLSearchParams(url.startsWith('?') ? url.slice(1) : url)
    // No more than a couple of params are expected (specifically, none for a true-default state).
    expect(Array.from(params.keys()).length).toBe(0)
  })

  it('falls back to defaults on invalid numeric advanced values', () => {
    const decoded = decodeStateFromUrl('?mu=garbage&rpm=-5&rep=999999')
    expect(decoded.maxUploadMb).toBe(defaultInstallState.maxUploadMb)
    // Bounded fields clamp:
    expect(decoded.rateLimitPerMin).toBeGreaterThan(0)
    // 999999 is fine for replicas (we don't cap), so it'll come through:
    expect(decoded.replicas).toBeGreaterThan(0)
  })

  it('falls back to defaults on invalid enum advanced values', () => {
    const decoded = decodeStateFromUrl('?pmode=cloudflare&tmode=tls13')
    expect(decoded.proxyMode).toBe(defaultInstallState.proxyMode)
    expect(decoded.tlsMode).toBe(defaultInstallState.tlsMode)
  })
})

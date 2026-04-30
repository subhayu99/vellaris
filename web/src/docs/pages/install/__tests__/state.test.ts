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
      runMode: 'compose',
      db: 'postgres',
      storage: 's3',
      image: 'slim',
      bucket: 'my-bucket',
      dbHost: 'pg.internal',
      credsMode: 'export',
    }
    const url = encodeStateToUrl(state)
    expect(url).toContain('run=compose')
    expect(url).toContain('db=postgres')
    expect(url).toContain('store=s3')
    expect(url).toContain('image=slim')
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
})

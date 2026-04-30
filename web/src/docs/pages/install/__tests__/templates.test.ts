import { describe, expect, it } from 'vitest'
import { defaultInstallState, type InstallState } from '../state'
import {
  generateDatabaseUrl,
  generateExportBlock,
  generateProxySnippet,
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
  it('emits a heredoc Dockerfile + build + run as a single shell block', () => {
    const custom: InstallState = { ...postgresS3Full, image: 'custom', runMode: 'docker' }
    const out = generateRunSnippet(custom, VERSION)
    expect(out).toContain('FROM ghcr.io/subhayu99/vellaris:0.5.0')
    expect(out).toContain("pip install --no-cache-dir 'vellaris[postgres,s3]==0.5.0'")
    expect(out).toContain('docker build')
    expect(out).toMatch(/^cat > Dockerfile <</m)
  })
})

describe('inline creds flow', () => {
  it('interpolates inline DB password into docker snippet', () => {
    const state: InstallState = {
      ...postgresS3Full,
      runMode: 'docker',
      credsMode: 'inline',
      credDbPassword: 's3cr3t',
    }
    const out = generateRunSnippet(state, VERSION)
    expect(out).toContain('s3cr3t')
    expect(out).not.toContain('${DB_PASSWORD}')
  })

  it('interpolates inline AWS creds into docker snippet', () => {
    const state: InstallState = {
      ...postgresS3Full,
      runMode: 'docker',
      credsMode: 'inline',
      credAwsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      credAwsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      credAwsRegion: 'us-west-2',
    }
    const out = generateRunSnippet(state, VERSION)
    expect(out).toContain('AKIAIOSFODNN7EXAMPLE')
    expect(out).not.toContain('${AWS_ACCESS_KEY_ID}')
  })

  it('interpolates inline DB password into compose snippet', () => {
    const state: InstallState = {
      ...postgresS3Full,
      runMode: 'compose',
      credsMode: 'inline',
      credDbPassword: 'mypassword',
    }
    const out = generateRunSnippet(state, VERSION)
    expect(out).toContain('mypassword')
    expect(out).not.toContain('${DB_PASSWORD}')
  })

  it('interpolates inline DB password into pip .env snippet', () => {
    const state: InstallState = {
      ...postgresS3Full,
      runMode: 'pip',
      credsMode: 'inline',
      credDbPassword: 'pippass',
    }
    const out = generateRunSnippet(state, VERSION)
    expect(out).toContain('DB_PASSWORD=pippass')
    expect(out).not.toContain('DB_PASSWORD=...')
  })
})

describe('advanced env vars', () => {
  it('omits all advanced env vars when state is default', () => {
    const out = generateRunSnippet(defaultInstallState, VERSION)
    expect(out).not.toContain('VELLARIS_MAX_UPLOAD_BYTES')
    expect(out).not.toContain('VELLARIS_RATE_LIMIT_PER_MINUTE')
    expect(out).not.toContain('VELLARIS_AUTO_MIGRATE')
  })

  it('emits non-default rate limits in docker run', () => {
    const s: InstallState = {
      ...defaultInstallState,
      runMode: 'docker',
      db: 'sqlite',
      storage: 'local',
      rateLimitPerMin: 60,
      rateLimitBurst: 10,
      maxUploadMb: 500,
    }
    const out = generateRunSnippet(s, VERSION)
    expect(out).toContain('VELLARIS_RATE_LIMIT_PER_MINUTE')
    expect(out).toContain("'60'")
    expect(out).toContain('VELLARIS_MAX_UPLOAD_BYTES')
    expect(out).toContain(String(500 * 1024 * 1024))
  })

  it('disables auto-migrate via env when state.autoMigrate=false', () => {
    const s: InstallState = {
      ...defaultInstallState,
      runMode: 'compose',
      db: 'postgres',
      autoMigrate: false,
    }
    const out = generateRunSnippet(s, VERSION)
    expect(out).toContain('VELLARIS_AUTO_MIGRATE')
    expect(out).toContain("'0'")
  })

  it('emits CORS allow-list when origins differ from "*"', () => {
    const s: InstallState = {
      ...defaultInstallState,
      runMode: 'pip',
      corsOrigins: 'https://app.example.com,https://admin.example.com',
    }
    const out = generateRunSnippet(s, VERSION)
    expect(out).toContain('VELLARIS_CORS_ALLOW_ORIGINS')
    expect(out).toContain('app.example.com')
  })
})

describe('replicas in compose', () => {
  it('adds deploy.replicas block when replicas > 1', () => {
    const s: InstallState = {
      ...defaultInstallState,
      runMode: 'compose',
      db: 'postgres',
      replicas: 3,
    }
    const out = generateRunSnippet(s, VERSION)
    expect(out).toContain('deploy:')
    expect(out).toContain('replicas: 3')
  })

  it('omits deploy block when replicas === 1', () => {
    const s: InstallState = {
      ...defaultInstallState,
      runMode: 'compose',
      db: 'postgres',
      replicas: 1,
    }
    const out = generateRunSnippet(s, VERSION)
    expect(out).not.toContain('deploy:')
  })
})

describe('Helm output', () => {
  it('emits values.yaml with image repo + tag + replica count', () => {
    const s: InstallState = {
      ...defaultInstallState,
      runMode: 'helm',
      db: 'postgres',
      storage: 's3',
      image: 'full',
      replicas: 2,
    }
    const out = generateRunSnippet(s, VERSION)
    expect(out).toContain('image:')
    expect(out).toContain('repository: ghcr.io/subhayu99/vellaris')
    expect(out).toContain(`tag: '${VERSION}-full'`)
    expect(out).toContain('replicaCount: 2')
  })
})

describe('systemd output', () => {
  it('emits a unit file with [Service] + Environment + ExecStart', () => {
    const s: InstallState = {
      ...defaultInstallState,
      runMode: 'systemd',
      db: 'postgres',
      storage: 'local',
    }
    const out = generateRunSnippet(s, VERSION)
    expect(out).toContain('[Service]')
    expect(out).toContain('ExecStart=/usr/local/bin/vellaris-server')
    expect(out).toContain('Environment=')
    expect(out).toContain('[Install]')
  })

  it('includes a pip install hint at the top', () => {
    const s: InstallState = { ...defaultInstallState, runMode: 'systemd', db: 'postgres', storage: 's3' }
    const out = generateRunSnippet(s, VERSION)
    expect(out).toContain("pip install 'vellaris[server,postgres,s3]")
  })
})

describe('proxy snippet', () => {
  it('returns null when proxyMode is none', () => {
    expect(generateProxySnippet(defaultInstallState)).toBeNull()
  })

  it('emits a Caddyfile for caddy mode', () => {
    const s: InstallState = {
      ...defaultInstallState,
      proxyMode: 'caddy',
      proxyHostname: 'vault.example.com',
    }
    const snippet = generateProxySnippet(s)
    expect(snippet).not.toBeNull()
    expect(snippet?.contents).toContain('vault.example.com')
    expect(snippet?.contents).toContain('reverse_proxy 127.0.0.1:8000')
  })

  it('emits an nginx server block for nginx mode', () => {
    const s: InstallState = {
      ...defaultInstallState,
      proxyMode: 'nginx',
      proxyHostname: 'vault.example.com',
      tlsMode: 'manual',
      tlsCertPath: '/certs/cert.pem',
      tlsKeyPath: '/certs/key.pem',
    }
    const snippet = generateProxySnippet(s)
    expect(snippet?.contents).toContain('server {')
    expect(snippet?.contents).toContain('proxy_pass http://127.0.0.1:8000')
    expect(snippet?.contents).toContain('ssl_certificate /certs/cert.pem')
  })

  it('emits Traefik labels for traefik mode', () => {
    const s: InstallState = {
      ...defaultInstallState,
      proxyMode: 'traefik',
      proxyHostname: 'vault.example.com',
    }
    const snippet = generateProxySnippet(s)
    expect(snippet?.contents).toContain('traefik.enable=true')
    expect(snippet?.contents).toContain('Host(`vault.example.com`)')
  })
})

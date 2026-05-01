# Deployment

Vellaris is a single FastAPI process plus a database (Postgres / MySQL /
SQLite) and a blob store (any fsspec backend — local FS, S3-compatible,
GCS, Azure). Every operator-facing knob is a `VELLARIS_*` env var.

## The fast path

For most users, the [`/docs/deployment` configurator](/docs/deployment)
generates a tailored `docker run` / `docker-compose` / `pip install`
snippet for your DB + storage combination.

This page is the source-of-truth reference for every env var and image
the configurator emits.

## Sizing

| Workload | RAM | CPU | Disk | Notes |
| --- | --- | --- | --- | --- |
| Single user | 256 MB | 1 vCPU | 1 GB | SQLite + local FS, slim image |
| 10 users | 512 MB | 1 vCPU | matches data | Postgres recommended |
| 100 users | 1 GB | 2 vCPU | matches data | S3-compatible storage recommended |
| 1000+ users | 2+ GB | 4+ vCPU | unbounded (S3) | Run >=2 replicas behind a LB |

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `VELLARIS_HOST` | `0.0.0.0` | Bind address |
| `VELLARIS_PORT` | `8000` | Bind port |
| `VELLARIS_DATABASE_URL` | `sqlite+aiosqlite:///./vellaris.db` | SQLAlchemy URL — pick `postgresql+asyncpg://...`, `mysql+asyncmy://...`, or `sqlite+aiosqlite://...` |
| `VELLARIS_AUTO_MIGRATE` | `1` | Run `alembic upgrade head` on startup. Set `0` for blue/green pipelines |
| `VELLARIS_BLOB_URL` | `file://./var/blobs` | fsspec URL — `file://`, `s3://`, `gs://`, `az://`, `memory://` |
| `VELLARIS_BLOB_OPTIONS_JSON` | _(unset)_ | Optional JSON-encoded `storage_options` (endpoint URL, custom certs, etc.) |
| `VELLARIS_AUDIT_SIGNING_KEY_PATH` | _(generated in memory)_ | Path to a 32-byte raw Ed25519 private key. Persist this in production |
| `VELLARIS_MAX_UPLOAD_BYTES` | `104857600` (100 MiB) | Per-file ceiling |
| `VELLARIS_RATE_LIMIT_PER_MINUTE` | `120` | Per-IP soft limit |
| `VELLARIS_RATE_LIMIT_BURST` | `20` | Per-IP burst budget |
| `VELLARIS_CORS_ALLOW_ORIGINS` | `["*"]` | Restrict in production |
| `VELLARIS_SESSION_TTL_SECONDS` | `28800` (8 h) | Session lifetime |
| `VELLARIS_CHALLENGE_TTL_SECONDS` | `300` (5 m) | Login-challenge lifetime |

## Image variants

| Tag | Size | Bundled drivers |
| --- | --- | --- |
| `ghcr.io/subhayu99/vellaris:0.5.0` | ~120 MB | SQLite + local FS only |
| `ghcr.io/subhayu99/vellaris:0.5.0-full` | ~350 MB | All DBs (Postgres / MySQL / SQLite) + S3 / GCS / Azure |

For a tailored slim+exactly-what-I-need image, use the composable
Dockerfile pattern emitted by the configurator:

```dockerfile
FROM ghcr.io/subhayu99/vellaris:0.5.0
RUN pip install --no-cache-dir 'vellaris[postgres,s3]==0.5.0'
```

## Cloud credentials

Vellaris reads cloud credentials from the standard environment variables
that fsspec already understands:

- **AWS / S3-compatible:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- **GCS:** `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
- **Azure:** `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_ACCOUNT_KEY`, or `AZURE_STORAGE_CONNECTION_STRING`

For non-AWS S3 endpoints (MinIO, Cloudflare R2, Backblaze B2, Wasabi),
pass the endpoint via `VELLARIS_BLOB_OPTIONS_JSON`:

```bash
export VELLARIS_BLOB_URL='s3://my-bucket'
export VELLARIS_BLOB_OPTIONS_JSON='{"endpoint_url":"https://s3.example.com","key":"AKIA...","secret":"..."}'
```

## Behind a reverse proxy

Vellaris doesn't terminate TLS — run it behind nginx / Caddy / Traefik.
The server reads `X-Forwarded-For` for rate-limiting; trust it only when
you're behind a proxy you control.

A minimal Caddyfile:

```
vault.example.com {
  reverse_proxy 127.0.0.1:8000
}
```

## Backup

Two pieces:

- **Database:** `pg_dump` / `mysqldump` / `sqlite3 .dump` on a schedule. Restore with the matching tool. Migrations are idempotent.
- **Blobs:** if you use a cloud bucket, enable cross-region replication or scheduled snapshots. For local FS, `rclone sync /var/lib/vellaris/blobs s3:backup` works well.

The audit signing key (`VELLARIS_AUDIT_SIGNING_KEY_PATH`) must persist
or existing audit log entries become unverifiable. Stash it in your
secret store.

## Health check

`GET /health` returns `{"status":"ok"}`. Use it as your liveness +
readiness probe. The Docker image has a built-in HEALTHCHECK with a 30s
start period — auto-migrate runs before uvicorn binds, so the probe
allows for first-boot Alembic to finish on a cold DB.

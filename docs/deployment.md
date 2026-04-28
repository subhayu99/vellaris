# Deployment

The Vellaris server is a single FastAPI process plus a database (Postgres
in production, SQLite for dev / single-user). Blobs go to local disk by
default; flip a flag to push to S3-compatible storage.

## Sizing

| Workload | RAM | CPU | Disk | Notes |
| --- | --- | --- | --- | --- |
| Single user, dev | 256 MB | 1 vCPU | 1 GB | SQLite + local disk |
| 10 users | 512 MB | 1 vCPU | matches data | Postgres recommended |
| 100 users | 1 GB | 2 vCPU | matches data | S3 backend recommended |
| 1000+ users | 2+ GB | 4+ vCPU | unbounded (S3) | Run >=2 replicas behind a LB |

The server is stateless apart from the DB + blob store, so horizontal
scaling is "add replicas behind a load balancer".

## Configuration

All config flows through environment variables. The full list is in
`src/vellaris/server/config.py`; the most important ones:

| Variable | Default | Notes |
| --- | --- | --- |
| `VELLARIS_HOST` | `0.0.0.0` | Bind address. |
| `VELLARIS_PORT` | `8000` | Bind port. |
| `VELLARIS_DATABASE_URL` | `sqlite+aiosqlite:///./vellaris.db` | Use `postgresql+psycopg://…` in prod. |
| `VELLARIS_BLOB_BACKEND` | `local` | `local` or `s3`. |
| `VELLARIS_BLOB_LOCAL_DIR` | `./blobs` | Local backend storage path. |
| `VELLARIS_BLOB_S3_BUCKET` | _(unset)_ | S3 bucket for ciphertext blobs. |
| `VELLARIS_BLOB_S3_REGION` | `us-east-1` | |
| `VELLARIS_BLOB_S3_ENDPOINT` | _(unset)_ | Override for MinIO / R2 / B2. |
| `VELLARIS_AUDIT_SIGNING_KEY` | _(generated on first start)_ | Ed25519 raw key, base64. Persist this. |
| `VELLARIS_MAX_UPLOAD_BYTES` | `5_368_709_120` (5 GiB) | Per-file ceiling. |
| `VELLARIS_RATE_LIMIT_PER_IP` | `120/min` | Soft limit. |
| `VELLARIS_CORS_ORIGINS` | `*` (dev), `[]` (prod) | Comma-separated for the SPA. |

## Docker — single container (SQLite)

Good for personal use:

```bash
docker run -d --name vellaris \
  -p 8000:8000 \
  -v vellaris-data:/data \
  -e VELLARIS_DATABASE_URL='sqlite+aiosqlite:////data/vellaris.db' \
  -e VELLARIS_BLOB_LOCAL_DIR=/data/blobs \
  -e VELLARIS_AUDIT_SIGNING_KEY="$(openssl rand -base64 32)" \
  ghcr.io/subhayu99/vellaris:latest
```

## Docker Compose — Postgres-backed

The repo ships [`docker/compose.yaml`](https://github.com/subhayu99/vellaris/blob/main/docker/compose.yaml):

```bash
git clone https://github.com/subhayu99/vellaris && cd vellaris
docker compose -f docker/compose.yaml up -d
```

Postgres data lives in a named volume; ciphertext blobs land on a host
mount you can back up. Customize via `.env` next to the compose file.

## Kubernetes — Helm chart sketch

A minimal `values.yaml`:

```yaml
image:
  repository: ghcr.io/subhayu99/vellaris
  tag: v0.1.0
  pullPolicy: IfNotPresent

replicaCount: 2

config:
  databaseUrl: postgresql+psycopg://vellaris:…@vellaris-postgres:5432/vellaris
  blobBackend: s3
  s3:
    bucket: vellaris-blobs
    region: us-east-1

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: vault.example.com
      paths: [/]
  tls:
    - hosts: [vault.example.com]
      secretName: vault-example-com-tls

resources:
  requests: { cpu: 250m, memory: 512Mi }
  limits:   { cpu: 1000m, memory: 1Gi }
```

A real chart isn't published yet — drop the manifests at `deploy/k8s/`
when you do this.

## Fly.io — one-click

```bash
flyctl launch --image ghcr.io/subhayu99/vellaris:latest --no-deploy
flyctl secrets set \
  VELLARIS_DATABASE_URL="$(flyctl postgres attach … --format json | jq -r '.connection_string')" \
  VELLARIS_AUDIT_SIGNING_KEY="$(openssl rand -base64 32)"
flyctl deploy
```

Add a Tigris S3 attachment for blob storage, point `VELLARIS_BLOB_S3_BUCKET`
at it, set `VELLARIS_BLOB_BACKEND=s3`.

## Railway

```bash
railway init --template ghcr.io/subhayu99/vellaris:latest
railway add --plugin postgresql
railway variables set VELLARIS_AUDIT_SIGNING_KEY="$(openssl rand -base64 32)"
railway up
```

## Behind a reverse proxy

Vellaris doesn't terminate TLS — run it behind nginx / Caddy / Traefik /
the load balancer of your cloud. The server reads `X-Forwarded-For` for
rate-limiting; trust it only when you're behind a proxy you control.

A minimal Caddyfile:

```
vault.example.com {
  reverse_proxy 127.0.0.1:8000
}
```

## Backup

Two pieces:

- **Database**: `pg_dump` (or `sqlite3 .dump`) on a schedule. Restore
  with `psql < dump.sql`. Migrations are idempotent.
- **Blobs**: `rclone sync /var/lib/vellaris/blobs s3:backup` — or just
  use S3 backend with cross-region replication.

The audit signing key (`VELLARIS_AUDIT_SIGNING_KEY`) must persist or
existing audit log entries become unverifiable. Stash it in your secret
store.

## Health check

`GET /healthz` returns `{"status":"ok"}` when the DB is reachable. Use it
as your liveness + readiness probe.

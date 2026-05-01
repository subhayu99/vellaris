## 0.5.2 — 2026-05-01

### Changed

- **Liveness route renamed `/healthz` → `/health`.** Cloud Run / Knative reserves paths under `/healthz` for platform probes, which prevented the app from serving its own liveness route there. The Python and TS clients' `healthz()` methods are renamed to `health()` and the Docker `HEALTHCHECK` now hits `/health`. If you have external monitors or proxies pointed at `/healthz`, repoint them.

## 0.5.1 — 2026-04-30

### Fixed

- **PyPI sdist→wheel build.** The `[tool.hatch.build.targets.sdist]` `include` list was missing `alembic/` and `alembic.ini`, so the strict-mode "build wheel from sdist" check that PyPI runs on publish couldn't satisfy the wheel's `force-include` block. v0.5.0 never published to PyPI as a result; v0.5.1 is the same code with the packaging fix.

## 0.5.0 — 2026-04-30

### Breaking changes

- **`VELLARIS_BLOB_BACKEND`, `VELLARIS_BLOB_ROOT`, `VELLARIS_S3_*` are removed.** Replaced by a single `VELLARIS_BLOB_URL` (an fsspec URL — `file://`, `s3://`, `gs://`, `az://`, etc.) plus an optional `VELLARIS_BLOB_OPTIONS_JSON`. Cloud credentials now flow through standard env vars (`AWS_*`, `GOOGLE_APPLICATION_CREDENTIALS`, `AZURE_*`) that fsspec reads natively.
- **`boto3` removed from base server install.** Install S3 support via `pip install vellaris[s3]` or use the `:VERSION-full` Docker tag.
- **Default Postgres async driver is now `asyncpg`.** `psycopg` URLs still work but the slim Docker image no longer bundles it; install via `pip install vellaris[postgres]`.

### Added

- **fsspec storage layer** — local FS, S3-compatible (AWS / MinIO / R2 / B2 / Wasabi), GCS, Azure Blob, SFTP, memory, etc. all via one URL.
- **MySQL / MariaDB support** via `vellaris[mysql]`.
- **Two Docker image variants:**
  - `:0.5.0` (slim, ~120 MB) — sqlite + local FS only.
  - `:0.5.0-full` (~350 MB) — every DB driver + every cloud storage backend.
- **`/docs/install` configurator** — pick run mode + DB + storage + image and copy a tailored `docker run` / `compose.yaml` / `Dockerfile` / `pip install` snippet.
- **Interactive CLI command builder** at `/docs/cli` — pick a command, fill args, copy.
- **Interactive SDK starter generator** at `/docs/sdk` — pick a recipe (upload / upload-and-share / download / list / share / revoke), pick async/sync, copy a runnable Python snippet.
- **Interactive API endpoint playground** at `/docs/api` — schema-driven generator (auto-built from FastAPI's OpenAPI); emits curl / Python httpx / JS fetch snippets per endpoint.
- **Advanced configuration panel** on `/docs/deployment` — rate limits, sessions, CORS, audit-key handling, replicas, reverse proxy (Caddy/nginx/Traefik), TLS.
- **Helm `values.yaml` and systemd unit file** as run-mode outputs in the deployment configurator.
- **Reverse-proxy snippet** (Caddyfile / nginx / Traefik labels) emitted alongside the main snippet when a proxy is configured.
- **Auto-migrations on startup** — controlled by `VELLARIS_AUTO_MIGRATE` (default `1`). Set to `0` for blue/green pipelines.
- **`vellaris-server migrate` subcommand** for explicit migration runs.
- **Pip extras:** `[sqlite]`, `[postgres]`, `[mysql]`, `[s3]`, `[gcs]`, `[azure]`, `[all-db]`, `[all-storage]`, `[all]`.

### Changed

- `/docs/install` is now `/docs/deployment`. The old URL redirects.

### Fixed

- Slim Docker image now actually boots with the documented SQLite default (was missing `aiosqlite`).
- `docs/deployment.md` env-var names match the code (multiple drift bugs corrected).
- Compose stack now uses `asyncpg` and the new `VELLARIS_BLOB_URL`.
- `alembic/env.py` async-to-sync URL translation now uses `psycopg2` (matches the new `[postgres]` extra; was `psycopg` v3 which isn't installed).

### Migration guide

The `/docs/install` configurator emits the snippet that matches your existing setup. For most operators:

1. Pull `:0.5.0` (slim) or `:0.5.0-full`.
2. Translate old env vars:
   - `VELLARIS_BLOB_BACKEND=local` + `VELLARIS_BLOB_ROOT=/x` → `VELLARIS_BLOB_URL=file:///x`
   - `VELLARIS_BLOB_BACKEND=s3` + `VELLARIS_S3_BUCKET=b` → `VELLARIS_BLOB_URL=s3://b` (plus standard `AWS_*` env vars)
3. If you use a custom psycopg driver string, switch to `asyncpg` for the slim image: `postgresql+psycopg://...` → `postgresql+asyncpg://...`.

# Quickstart

Three paths, same outcome — a file you encrypted, sitting on a server you
control, that only the people you chose can read.

## CLI in 60 seconds

```bash
pip install vellaris

# Point the CLI at a Vellaris server you trust.
vellaris config set server https://vault.example.com

# Sign up. The CLI generates an RSA-4096 keypair locally and asks for a
# passphrase. The passphrase never leaves your machine.
vellaris signup --username alice --email alice@example.com

# Push a file, sharing it with bea and cyrus.
vellaris push report.pdf --share bea --share cyrus

# List what you can read on this server.
vellaris ls

# Pull a file someone shared with you.
vellaris pull <doc-id> -o ~/Downloads/

# Hand off access.
vellaris share <doc-id> dana
vellaris revoke <doc-id> bea

# Delete a document you own (everyone loses access — they keep what they
# already downloaded; revoke is forward-only).
vellaris rm <doc-id>
```

The keystore lives at `~/.vellaris/keys/<user-id>.key`. The config lives at
`~/.vellaris/config.toml`.

## Server in 5 minutes

The server is one Docker container plus a Postgres (or SQLite for dev).

### docker run (single-container, SQLite)

Good for trying it out. **Not** for production — SQLite + a single replica
gives no durability guarantees.

```bash
docker run -d --name vellaris \
  -p 8000:8000 \
  -v vellaris-data:/data \
  -e VELLARIS_DATABASE_URL='sqlite+aiosqlite:////data/vellaris.db' \
  -e VELLARIS_BLOB_BACKEND=local \
  -e VELLARIS_BLOB_LOCAL_DIR=/data/blobs \
  ghcr.io/subhayu99/vellaris:latest
```

Then:

```bash
curl http://localhost:8000/healthz
# {"status":"ok"}
```

### docker compose (Postgres-backed)

```bash
git clone https://github.com/subhayu99/vellaris
cd vellaris
docker compose -f docker/compose.yaml up -d
```

The compose file launches Postgres + the server, runs Alembic migrations on
boot, and exposes the API on `:8000`.

For real deployments see the [deployment guide](deployment.md).

## Web UI

The SPA is a static build — drop it on any HTTPS host and point it at your
Vellaris server.

The official build is hosted at
[`subhayu99.github.io/vellaris`](https://subhayu99.github.io/vellaris)
(future: `app.vellaris.dev`). Each release also ships a self-host tarball
`vellaris-web-vX.Y.Z.tar.gz` under
[GitHub Releases](https://github.com/subhayu99/vellaris/releases).

First load asks for your server's URL, runs `GET /healthz`, and caches the
URL in `localStorage`. After signup the wrapped private key is stored
locally too. **localStorage is per-origin** — two SPA deployments are
independent.

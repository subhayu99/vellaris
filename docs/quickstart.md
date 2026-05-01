# Quickstart

Three paths, same outcome — a file you encrypted, sitting on a server you
control, that only the people you chose can read.

## CLI in 60 seconds

```bash
pip install vellaris
# or: uv tool install vellaris

# Sign up. --server is required and gets saved for future commands. The
# CLI prompts for username, email, and a passphrase; generates an
# RSA-4096 keypair locally; the passphrase never leaves your machine.
vellaris signup --server https://vault.example.com

# Open a session. Server + username are remembered from signup; pass
# --server / --username only to override.
vellaris login

# Push a file, sharing it with bea and cyrus.
vellaris push report.pdf --share bea --share cyrus

# List what you can read on this server.
vellaris ls

# Pull a file someone shared with you. Default writes the original
# filename into CWD; -o overrides with a specific file path.
vellaris pull <doc-id>
vellaris pull <doc-id> -o ./report.pdf

# Hand off access.
vellaris share <doc-id> dana
vellaris revoke <doc-id> bea

# Delete a document you own (everyone loses access — they keep what they
# already downloaded; revoke is forward-only).
vellaris rm <doc-id>
```

The wrapped key blob lives at `~/.vellaris/keys/<user-id>.key`. The
configured server URL and the most-recent username are persisted to
`~/.vellaris/config.toml` on signup; `vellaris login` reads them back
automatically. There is no `vellaris config` command — to switch
servers later, pass `--server` on `vellaris login` or edit the config
file directly.

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
  -e VELLARIS_BLOB_URL='file:///data/blobs' \
  ghcr.io/subhayu99/vellaris:0.5.0
```

Then:

```bash
curl http://localhost:8000/health
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

First load asks for your server's URL, runs `GET /health`, and caches the
URL in `localStorage`. After signup the wrapped private key is stored
locally too. **localStorage is per-origin** — two SPA deployments are
independent.

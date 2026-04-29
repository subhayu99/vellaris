<div align="center">

```
                    _ _            _
       __   _____| | | __ _ _ __(_)___
       \ \ / / _ \ | |/ _` | '__| / __|
        \ V /  __/ | | (_| | |  | \__ \
         \_/ \___|_|_|\__,_|_|  |_|___/
```

**_Files only the people you choose can read._**

End-to-end encrypted document sharing you self-host.

```bash
pip install vellaris
```

[Source](https://github.com/subhayu99/vellaris) ·
[PyPI](https://pypi.org/project/vellaris/) ·
[Docs](https://docs.vellaris.dev) ·
[License](./LICENSE)

</div>

---

## Status

`v0.2.0` — feature drop. Alpha; expect rough edges. The on-wire format
is still locked, so blobs encrypted with any v0.x release keep
decrypting on later versions.

What v0.2 adds on top of the v0.1 baseline:

- **Web Worker for crypto.** RSA-4096 keygen and Argon2id-at-prod-params
  no longer block the main thread on signup or login. The
  `EncryptAnim` actually animates instead of stuttering.
- **IndexedDB-backed key store.** The wrapped private key now lives in
  IDB, with one-shot migration from any pre-existing localStorage entry.
- **Streaming uploads.** The upload route reads files via
  `File.stream()` instead of `file.arrayBuffer()`, so the SPA no longer
  trips ArrayBuffer size limits on multi-hundred-megabyte uploads.

Plus the v0.1.3 → v0.1.5 fixes already in: owner-visible "shared with"
chips on `/doc/:id`, manual Cloudflare pageviews on the public auth
routes only (no leak past login), and a strict-ish Content-Security-
Policy on the SPA.

## How it works

Vellaris encrypts files **on your device** with a fresh AES-256 key, then
encrypts that key once for each recipient with their RSA-4096 public key.
Your self-hosted server only ever holds ciphertext, encrypted-DEK rows,
and a signed audit log — it cannot decrypt anything.

```
crypto: AES-256-GCM · RSA-4096 OAEP-SHA256 · Argon2id passphrase KDF
```

## Three clients, one trust boundary

| Client | Install | When to reach for it |
|---|---|---|
| **CLI** | `pip install vellaris` | Engineers, scripts, CI pipelines |
| **Python SDK** | `pip install vellaris` | Automations, ETLs, webhook handlers |
| **Web** | Static SPA, deploy-anywhere | Colleagues who don't live in a terminal |

Every client speaks the same on-wire protocol; the server publishes its
contract at `/openapi.json`.

## Run a server

```bash
docker run -p 8000:8000 ghcr.io/subhayu99/vellaris:latest
```

Or `docker compose -f docker/compose.yaml up` for a Postgres-backed dev stack.

## License

[Apache 2.0](./LICENSE). No CLA traps. Read every line on GitHub.

# Vellaris

> Files only the people you choose can read.

**Vellaris** is open-source, end-to-end encrypted document sharing you
self-host. Your laptop holds the keys. Your server holds ciphertext. Your
colleagues just get the file.

```bash
pip install vellaris
```

## Three clients, one wire format

| Client     | Install                                | When to reach for it                                |
| ---------- | -------------------------------------- | --------------------------------------------------- |
| **CLI**    | `pip install vellaris`                 | Engineers, scripts, CI pipelines                    |
| **Python SDK** | `pip install vellaris`             | Automations, ETLs, webhook handlers                 |
| **Web**    | Static SPA, deploy anywhere            | Colleagues who don't live in a terminal             |

Every client speaks the same on-wire protocol; the server publishes its
contract at `/openapi.json`. See [Build your own client](build-your-own-client.md)
if you want a fourth.

## How it works

Vellaris encrypts files on your device with a fresh AES-256 key, then
encrypts that key once for each recipient with their RSA-4096 public key.
Your self-hosted server only ever holds ciphertext, encrypted-DEK rows,
and a signed audit log — it cannot decrypt anything.

```
crypto: AES-256-GCM · RSA-4096 OAEP-SHA256 · Argon2id passphrase KDF · Ed25519 audit
```

Read the [security model](security-model.md) for the honest version: what's
protected, what isn't, and what we punt on.

## Get going

- [Quickstart](quickstart.md) — CLI in 60 seconds, server in 5 minutes
- [Security model](security-model.md) — what's protected, what isn't
- [CLI reference](cli.md) — every `vellaris …` command, by example
- [Python SDK](sdk.md) — `vellaris.client.Client` for automations
- [Deployment guide](deployment.md) — Docker Compose, Kubernetes, fly.io / Railway
- [Build your own client](build-your-own-client.md) — on-wire format spec

## Status

`v0.1.0` — first shippable release. Alpha-stage; expect rough edges and a
few rough APIs. The on-wire format is locked, so blobs encrypted with
this release keep decrypting on later versions.

## Source

[github.com/subhayu99/vellaris](https://github.com/subhayu99/vellaris) ·
Apache-2.0

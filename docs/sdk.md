# Python SDK

`vellaris.client.Client` is the same code path the CLI uses, exposed as a
library. There's an async version (`AsyncClient`) for FastAPI / Trio /
asyncio handlers, and a sync wrapper (`Client`) for scripts.

```bash
pip install vellaris
```

## Quick example

```python
from vellaris.client import Client

c = Client("https://vault.example.com")
c.login(username="alice", passphrase="…")

# Upload, share, list, download.
doc = c.push(path="report.pdf", recipients=["bea", "cyrus"])
print(doc.id)

for d in c.ls(scope="mine"):
    print(d.id, d.filename)

c.pull(doc_id=doc.id, out_dir="~/Downloads/")
c.share(doc_id=doc.id, username="dana")
c.revoke(doc_id=doc.id, username="bea")
c.rm(doc_id=doc.id)
```

## Async flavor

```python
import asyncio
from vellaris.client import AsyncClient

async def main():
    async with AsyncClient("https://vault.example.com") as c:
        await c.login(username="alice", passphrase="…")
        async for d in c.aiter_ls(scope="all"):
            print(d.id, d.filename)

asyncio.run(main())
```

`AsyncClient` is the source of truth — `Client` wraps it via `asyncio.run`.

## Auth lifecycle

```python
# Signup runs the keygen + Argon2id wrap locally and POSTs the public key.
c.signup(username="alice", email="alice@example.com", passphrase="…")

# Login runs challenge-response. The bearer token is cached on the
# instance until logout / reconnect.
c.login(username="alice", passphrase="…")

# whoami / current_user
me = c.whoami()
print(me.id, me.username)

# Drop the token on both ends.
c.logout()
```

## Working with bytes directly

For automations that don't want to round-trip through a temp file:

```python
ciphertext_bundle = c.encrypt(
    plaintext=b"...",
    filename="report.pdf",
    recipients=["bea", "cyrus"],
)
# Send / store / inspect ciphertext_bundle yourself…

# Or: upload it.
doc = c.upload(ciphertext_bundle)
```

For decrypting a downloaded blob:

```python
download = c.fetch(doc_id="…")     # returns DocumentDownload
decrypted = c.decrypt(download)    # returns DecryptedDocument(filename, plaintext)
```

These low-level helpers are the same primitives the CLI uses; see
`vellaris/client/crypto.py` for the source of truth.

## Custom transports

Pass `transport=` to drive the client against an in-process server in
tests:

```python
import httpx
from fastapi.testclient import TestClient
from vellaris.client import AsyncClient
from vellaris.server.app import create_app

async def test_round_trip():
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with AsyncClient("http://test", transport=transport) as c:
        # … real challenge / verify / push / pull …
```

## Errors

| Class                      | When                                                     |
| -------------------------- | -------------------------------------------------------- |
| `VellarisAPIError`         | Server returned 4xx / 5xx. `.status` and `.detail` set.  |
| `VellarisNetworkError`     | DNS / TLS / CORS / connection refused.                   |
| `vellaris.core.DecryptError` | Wrong passphrase, tampered blob, AEAD tag mismatch.    |
| `vellaris.core.SignatureError` | PSS / Ed25519 verification failed.                   |
| `vellaris.core.KdfError`     | Argon2 params invalid (or below the safety floor).     |
| `vellaris.core.WireFormatError` | Blob is malformed / truncated / unknown version.    |

Catch the broad ones in scripts:

```python
from vellaris.core import VellarisCryptoError
from vellaris.client import VellarisAPIError, VellarisNetworkError

try:
    c.pull(doc_id, out_dir=...)
except VellarisAPIError as e:
    print(f"server said {e.status}: {e.detail}")
except VellarisCryptoError as e:
    print(f"crypto failed: {e}")
except VellarisNetworkError:
    print("server unreachable")
```

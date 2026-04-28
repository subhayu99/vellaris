# Build your own client

Vellaris's wire formats are documented exactly so a client in any
language can read what the Python CLI / SDK / web SPA write, and vice
versa. The TS port at `web/src/crypto/` is the second implementation —
its byte-level interop test (`web/tests/interop.test.ts`) is the
reference cross-implementation check.

## On-wire format — AES-GCM ciphertext envelope

```
┌─────────┬───────────┬─────────┬──────────────┐
│ version │  nonce    │   tag   │  ciphertext  │
│  1 byte │ 12 bytes  │ 16 bytes│   variable   │
└─────────┴───────────┴─────────┴──────────────┘
```

- **version**: `0x01` for AES-256-GCM with this layout. Reject anything
  else — don't guess.
- **nonce**: 12 random bytes (AES-GCM standard, NIST SP 800-38D §8.2).
- **tag**: 16-byte authentication tag.
- **ciphertext**: variable length.

Notice the tag is **before** the ciphertext, not appended. This lets a
streaming reader verify the tag without buffering the whole blob.
Vellaris doesn't stream in v1, but the layout is forward-friendly.

Reference: `src/vellaris/core/wire.py`.

## On-wire format — wrapped private key

The user's RSA-4096 private key, encrypted with an Argon2id-derived key
from their passphrase. The result is what's stored in
`~/.vellaris/keys/<user-id>.key` and (opt-in) at
`PUT /key-blobs/me`.

```
┌─────────┬──────────┬──────────────┬──────────────┬──────────────────┐
│ version │   salt   │ params_len   │ params_json  │  inner ciphertext│
│  1 byte │ 16 bytes │   2 bytes BE │   variable   │   (envelope above)│
└─────────┴──────────┴──────────────┴──────────────┴──────────────────┘
```

- **version**: `0x01`.
- **salt**: 16 random bytes for Argon2id.
- **params_len**: uint16, big-endian.
- **params_json**: the literal bytes of
  `json.dumps({"l":32,"m":262144,"p":4,"t":3}, sort_keys=True, separators=(",",":"))`,
  i.e. `{"l":32,"m":262144,"p":4,"t":3}`. The keys are alphabetical
  (`l`, `m`, `p`, `t` → key length, memory cost in KiB, parallelism,
  time cost). Anything else makes the AAD check fail.
- **inner ciphertext**: an AES-GCM envelope (above) whose plaintext is
  the unencrypted PKCS#8 PEM bytes. The encryption key comes from
  `Argon2id(passphrase, salt, params)`. The associated data (AAD) is
  `version || salt || params_json` — flipping any of those after wrap
  invalidates the tag.

Reference: `src/vellaris/core/wrap.py`. Default Argon2id params match
RFC 9106 / OWASP recommendations: 256 MiB · 3 passes · 4 lanes · 32-byte
output.

## RSA usage

| Operation | Padding | Hash | Salt | Used for |
| --- | --- | --- | --- | --- |
| Encrypt the per-document AES key | OAEP | SHA-256 + MGF1(SHA-256) | label = empty | Wrapping the DEK per recipient. |
| Sign the auth challenge | PSS | SHA-256 + MGF1(SHA-256) | 32 bytes | `POST /auth/verify`. |

**These must use distinct CryptoKey handles** — same modulus, different
padding, different threat model. (Re-using one across both is the bug
the original PoC shipped with.)

PEM serialization is unencrypted PKCS#8 for the private key,
`SubjectPublicKeyInfo` for the public. The Vellaris reference writes 64-
character body lines with `\n` separators (matching Python's
`cryptography` default) so blobs round-trip byte-for-byte.

## Auth flow

```
client                                          server
  | POST /auth/challenge {"username": "alice"}
  |─────────────────────────────────────────────>|
  |                                              |  generate (challenge_id, nonce)
  |     201 {challenge_id, nonce, expires_at}    |
  |<─────────────────────────────────────────────|
  |
  |  unwrap private key with passphrase locally
  |  message = challenge_id.bytes  ||  nonce
  |  signature = RSA-PSS(message, private_key)
  |
  | POST /auth/verify {challenge_id, signature}
  |─────────────────────────────────────────────>|
  |                                              |  challenge.expires_at < now → 410
  |                                              |  PSS-verify with stored public_key
  |                                              |  delete challenge (single-use, even on failure)
  |              200 {token, expires_at, user}   |
  |<─────────────────────────────────────────────|
```

The bytes signed are exactly `challenge.id.bytes || challenge.nonce`,
**not** a JSON-encoded version. `challenge.id.bytes` is the raw 16-byte
big-endian UUID (as `uuid.UUID(s).bytes` returns it).

Reference: `src/vellaris/server/routes/auth.py:_signed_blob`.

## Document upload

`POST /documents` body:

```json
{
  "encrypted_filename": "<base64 wire envelope of AES(filename, dek)>",
  "content_hash": "sha256:<64 hex of SHA-256(plaintext)>",
  "ciphertext": "<base64 wire envelope of AES(plaintext, dek)>",
  "access": [
    {"user_id": "<uuid>", "encrypted_dek": "<base64 RSA-OAEP(dek, public_key)>"},
    ...
  ]
}
```

The owner MUST be in `access` — the server enforces this. The DEK is a
fresh 32 random bytes per document, generated client-side.

Reference: `src/vellaris/client/crypto.py:encrypt_for_recipients`.

## Test vectors

`web/tests/fixtures/` ships six binary blobs produced by the Python
reference (`web/tests/fixtures/generate.py` regenerates them). The TS
port re-decodes them and asserts byte equality. If you're building a
third client, run those same fixtures through your decoder — your suite
should pass them.

```
public_key.pem            RSA-4096 SPKI
wrapped_private_key.bin   passphrase = "vellaris-test-passphrase",
                          Argon2id m=64KiB · t=1 · p=1 (test-fast),
                          PKCS#8 PEM as plaintext
ciphertext.bin            AES-GCM(b"hello vellaris interop\n", DEK = bytes(range(32)))
encrypted_dek.bin         RSA-OAEP(DEK, public_key)
pss_signature.bin         RSA-PSS(b"challenge-id-bytes-and-nonce", private_key)
meta.json                 the constants above, JSON-encoded
```

The full HTTP API is published as OpenAPI at
`https://your-server/openapi.json` so you can codegen typed clients in
any language.

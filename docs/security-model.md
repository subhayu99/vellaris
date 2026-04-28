# Security model

The honest version. What's protected, what isn't, and what we punt on.

## Threat model

Vellaris assumes the **server is curious** but not actively malicious — it
shouldn't need to be trusted with plaintext, but we don't try to defend
against the operator splicing in their own builds. If you don't trust the
operator, run your own.

| Adversary | Defended? | Notes |
| --- | :---: | --- |
| Server reading your file content | ✓ | Ciphertext only on disk + on the wire. The server never holds a DEK in plaintext. |
| Server reading filenames | ✓ | Filenames are AES-encrypted under the per-document DEK. |
| Server impersonating a user | ✓ | Auth is challenge-response with the user's private key — server never sees passwords. |
| Server tampering with audit log | ✓ | Each entry is Ed25519-signed with the server's audit key. Tampering is detectable; deletion is not (forward-only log, append-only). |
| Network eavesdropper | ✓ (with HTTPS) | The wire is base64-over-HTTPS. Run behind TLS in production. |
| Active attacker swapping the SPA | ✗ | If the host serving `index.html` is compromised, you lose. Subresource Integrity helps but isn't a magic fix. Pin a specific tarball if you care. |
| Stolen device with the wrapped key | Partial | The wrapped key is Argon2id-protected. A weak passphrase fails. |
| Compromised browser session | ✗ | Once you're logged in, anything that can run JS in the same origin can decrypt your files. Use a separate browser profile if you must. |

## What's NOT protected

- **Access-pattern metadata.** The server sees who downloaded what, when,
  from which IP. Use Tor or a VPN if that matters.
- **Revoked recipients who already downloaded.** Revoke is forward-only.
  If alice grants bea access, bea downloads, alice revokes — bea still has
  the plaintext. The server can't reach into bea's laptop.
- **Forgotten passphrases.** There is no recovery flow. If you forget your
  passphrase and you don't have a wrapped key sync, your files are
  unrecoverable. This is a feature.
- **Side-channel attacks.** WebCrypto's RSA / AES are not constant-time on
  every platform. Don't run Vellaris alongside untrusted JS on the same
  origin.
- **Forward secrecy of past content.** A compromised RSA private key
  decrypts every DEK ever wrapped to that user. Key rotation lands in v2.

## Cryptographic choices

| Primitive | Choice | Why |
| --- | --- | --- |
| Symmetric AEAD | AES-256-GCM, 12-byte nonce, 16-byte tag | NIST-recommended, hardware-accelerated everywhere. |
| Asymmetric (DEK wrapping) | RSA-4096 OAEP-SHA256 + MGF1(SHA-256) | Browsers + Python both ship this. ML-KEM 768 lands in v2. |
| Asymmetric (auth challenge) | RSA-PSS-SHA256, salt_length=32 | Distinct padding from OAEP — sign/verify must NOT reuse the OAEP key handles. (The original PoC's bug.) |
| Passphrase KDF | Argon2id, 256 MiB · 3 passes · 4 lanes | RFC 9106 + OWASP recommendation. ~1–2 s on Apple Silicon. |
| Audit log signature | Ed25519, raw 32-byte keys | Server-side; the server signs every state-changing action. |

## On-wire formats

Every encrypted blob carries a 1-byte version prefix so we can swap
schemes without breaking old data. See [Build your own client](build-your-own-client.md)
for the byte-exact layouts.

## Disclosure

Security issues: please email `balasubhayu99@gmail.com` rather than filing
a public issue. PGP key fingerprint will land here when v0.1.0 ships.

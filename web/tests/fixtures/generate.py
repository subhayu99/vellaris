"""Generate cross-side interop fixtures from the Python `vellaris.core`.

The TS port at `web/src/crypto/` claims byte-level compatibility with this
module. This script produces blobs the TS test re-decodes; see
`web/tests/interop.test.ts` for the verifier.

Run from the repo root:

    .venv/bin/python web/tests/fixtures/generate.py

Outputs are written to this directory (committed under git so CI / dev
machines can run the tests without a working Python install).

Argon2 parameters are intentionally reduced (m=64 KiB · t=1 · p=1) so
unwrap is fast in vitest. The wrapped blob carries the params it was
wrapped with, so byte-level interop is verified for THAT layout — not
for production parameters specifically. (Production-parameter wrap is
covered by the runtime path; the fixture's role is to lock the format.)
"""

from __future__ import annotations

import json
from pathlib import Path

from vellaris.core.asymmetric import (
    generate_keypair,
    oaep_encrypt,
    pss_sign,
    serialize_private_key,
    serialize_public_key,
)
from vellaris.core.kdf import Argon2Params
from vellaris.core.symmetric import encrypt as aes_encrypt
from vellaris.core.wire import pack
from vellaris.core.wrap import wrap_private_key

FIXTURE_DIR = Path(__file__).resolve().parent

PASSPHRASE = "vellaris-test-passphrase"
PLAINTEXT = b"hello vellaris interop\n"
DEK = bytes(range(32))  # deterministic test DEK (0x00..0x1f)
PSS_MESSAGE = b"challenge-id-bytes-and-nonce"
FAST_PARAMS = Argon2Params(memory_cost_kib=64, time_cost=1, parallelism=1, key_length=32)


def main() -> None:
    pair = generate_keypair()
    private_pem = serialize_private_key(pair.private_key)
    public_pem = serialize_public_key(pair.public_key)

    wrapped = wrap_private_key(private_pem, PASSPHRASE, params=FAST_PARAMS)

    sealed = aes_encrypt(PLAINTEXT, DEK)
    ciphertext_blob = pack(sealed)

    encrypted_dek = oaep_encrypt(DEK, pair.public_key)
    pss_signature = pss_sign(PSS_MESSAGE, pair.private_key)

    meta = {
        "passphrase": PASSPHRASE,
        "plaintext": PLAINTEXT.decode("utf-8"),
        "dek_hex": DEK.hex(),
        "argon2_params": {
            "m": FAST_PARAMS.memory_cost_kib,
            "t": FAST_PARAMS.time_cost,
            "p": FAST_PARAMS.parallelism,
            "l": FAST_PARAMS.key_length,
        },
        "pss_message": PSS_MESSAGE.decode("utf-8"),
        "description": (
            "Cross-side fixtures produced by vellaris.core. "
            "TS verifies it can unwrap, OAEP-decrypt, AES-decrypt, and PSS-verify "
            "everything here using web/src/crypto/."
        ),
    }

    (FIXTURE_DIR / "public_key.pem").write_bytes(public_pem)
    (FIXTURE_DIR / "wrapped_private_key.bin").write_bytes(wrapped)
    (FIXTURE_DIR / "ciphertext.bin").write_bytes(ciphertext_blob)
    (FIXTURE_DIR / "encrypted_dek.bin").write_bytes(encrypted_dek)
    (FIXTURE_DIR / "pss_signature.bin").write_bytes(pss_signature)
    (FIXTURE_DIR / "meta.json").write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n")

    print(f"wrote 6 fixtures to {FIXTURE_DIR}")
    print(f"  public_key.pem            {len(public_pem)} B")
    print(f"  wrapped_private_key.bin   {len(wrapped)} B")
    print(f"  ciphertext.bin            {len(ciphertext_blob)} B")
    print(f"  encrypted_dek.bin         {len(encrypted_dek)} B")
    print(f"  pss_signature.bin         {len(pss_signature)} B")


if __name__ == "__main__":
    main()

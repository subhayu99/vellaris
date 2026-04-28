"""Passphrase-wrapped private-key blobs.

Combines :mod:`vellaris.core.kdf` and :mod:`vellaris.core.symmetric` to
turn a PEM-encoded private key into a single bytestring that can be
written to ``~/.vellaris/keys/<user-id>.key`` or pushed (opt-in) as an
opaque blob to the server. The server cannot decrypt the result because
the passphrase never leaves the client.

Layout for ``WRAPPED_V1``::

    ┌─────────┬──────────┬──────────────┬──────────────┬──────────────────┐
    │ version │   salt   │ params_len   │ params_json  │  inner ciphertext│
    │  1 byte │ 16 bytes │   2 bytes    │   variable   │   (wire envelope)│
    └─────────┴──────────┴──────────────┴──────────────┴──────────────────┘

The version byte, salt, and params_json bytes are bound to the AES-GCM
ciphertext via the AEAD's associated-data slot, so altering them after
wrapping invalidates the tag and produces a :class:`DecryptError` at
unwrap time.
"""

from __future__ import annotations

import json
import struct
from typing import Final

from vellaris.core.errors import DecryptError, WireFormatError
from vellaris.core.kdf import SALT_SIZE, Argon2Params, derive_key, random_salt
from vellaris.core.symmetric import decrypt as aes_decrypt
from vellaris.core.symmetric import encrypt
from vellaris.core.wire import pack, unpack

WRAPPED_V1: Final[int] = 0x01

_PARAMS_LEN_FIELD: Final[int] = 2  # uint16 big-endian
_HEADER_FIXED: Final[int] = 1 + SALT_SIZE + _PARAMS_LEN_FIELD


def _associated_data(version: int, salt: bytes, params_bytes: bytes) -> bytes:
    """Bind version + salt + params to the AEAD tag."""
    return bytes([version]) + salt + params_bytes


def wrap_private_key(
    pem_bytes: bytes,
    passphrase: bytes | str,
    *,
    params: Argon2Params | None = None,
) -> bytes:
    """Encrypt ``pem_bytes`` with a key derived from ``passphrase``.

    Returns a single bytestring suitable for writing to disk. The salt
    and Argon2 parameters are stored alongside so the same passphrase
    can re-derive the key at unwrap time.
    """
    if not isinstance(pem_bytes, (bytes, bytearray)):
        raise TypeError(f"pem_bytes must be bytes, got {type(pem_bytes).__name__}")

    p = params or Argon2Params()
    salt = random_salt()
    key = derive_key(passphrase, salt, p)
    params_bytes = json.dumps(p.to_dict(), sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(params_bytes) > 0xFFFF:
        # Practically unreachable; defensive cap to keep the 2-byte length field honest.
        raise WireFormatError(f"params_json too large: {len(params_bytes)} bytes")

    aad = _associated_data(WRAPPED_V1, salt, params_bytes)
    sealed = encrypt(bytes(pem_bytes), key, associated_data=aad)
    inner = pack(sealed)

    return bytes([WRAPPED_V1]) + salt + struct.pack(">H", len(params_bytes)) + params_bytes + inner


def unwrap_private_key(blob: bytes, passphrase: bytes | str) -> bytes:
    """Decrypt a blob produced by :func:`wrap_private_key`.

    Raises :class:`WireFormatError` for structural problems (unknown
    version, truncated header, malformed params) and :class:`DecryptError`
    for crypto failures (wrong passphrase, tampered bytes).
    """
    if not isinstance(blob, (bytes, bytearray)):
        raise WireFormatError(f"blob must be bytes, got {type(blob).__name__}")
    if len(blob) < _HEADER_FIXED:
        raise WireFormatError(f"blob too short: {len(blob)} < {_HEADER_FIXED}")

    version = blob[0]
    if version != WRAPPED_V1:
        raise WireFormatError(f"unknown wrapped-key version: 0x{version:02x}")

    salt = bytes(blob[1 : 1 + SALT_SIZE])
    (params_len,) = struct.unpack(">H", bytes(blob[1 + SALT_SIZE : _HEADER_FIXED]))

    params_end = _HEADER_FIXED + params_len
    if params_end > len(blob):
        raise WireFormatError(f"truncated params field: needed {params_end} bytes, got {len(blob)}")

    params_bytes = bytes(blob[_HEADER_FIXED:params_end])
    inner = bytes(blob[params_end:])

    try:
        params_dict = json.loads(params_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WireFormatError(f"malformed params JSON: {exc}") from exc

    params = Argon2Params.from_dict(params_dict)
    sealed = unpack(inner)

    key = derive_key(passphrase, salt, params)
    aad = _associated_data(version, salt, params_bytes)
    return aes_decrypt(sealed, key, associated_data=aad)


def is_wrapped_blob(blob: bytes) -> bool:
    """Cheap sniff: does ``blob`` start with a known wrapped-key version byte?"""
    return len(blob) >= 1 and blob[0] == WRAPPED_V1


__all__ = [
    "WRAPPED_V1",
    "DecryptError",  # re-exported for callers that want a one-stop import
    "is_wrapped_blob",
    "unwrap_private_key",
    "wrap_private_key",
]

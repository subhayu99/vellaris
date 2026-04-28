"""AES-256-GCM symmetric encryption.

The unit operates on raw bytes and returns the three GCM components
(nonce, tag, ciphertext) separately. Composing them into the on-wire
envelope is the responsibility of :mod:`vellaris.core.wire`.

Only AES-256 is supported. AES-128/192 are intentionally not exposed —
the project locks 256 across the board so there is exactly one knob to
audit.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Final

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from vellaris.core.errors import DecryptError

KEY_SIZE: Final[int] = 32
"""AES-256 key length in bytes."""

NONCE_SIZE: Final[int] = 12
"""GCM nonce length in bytes — 96 bits is the NIST-recommended size."""

TAG_SIZE: Final[int] = 16
"""GCM authentication tag length in bytes."""


@dataclass(frozen=True, slots=True)
class GcmCiphertext:
    """The three components of an AES-GCM encryption result."""

    nonce: bytes
    tag: bytes
    ciphertext: bytes


def random_key() -> bytes:
    """Return a fresh 32-byte AES-256 key from the OS CSPRNG."""
    return os.urandom(KEY_SIZE)


def _validate_key(key: bytes) -> None:
    if not isinstance(key, (bytes, bytearray)):
        raise TypeError(f"key must be bytes, got {type(key).__name__}")
    if len(key) != KEY_SIZE:
        raise ValueError(f"key must be {KEY_SIZE} bytes (AES-256), got {len(key)}")


def encrypt(plaintext: bytes, key: bytes, *, associated_data: bytes | None = None) -> GcmCiphertext:
    """Encrypt ``plaintext`` under ``key`` with a fresh random nonce.

    ``associated_data`` is authenticated but not encrypted; pass the
    same value to :func:`decrypt` or the tag check will fail.
    """
    _validate_key(key)
    nonce = os.urandom(NONCE_SIZE)
    aead = AESGCM(bytes(key))
    sealed = aead.encrypt(nonce, plaintext, associated_data)
    # `cryptography` returns ciphertext || tag concatenated.
    ciphertext, tag = sealed[:-TAG_SIZE], sealed[-TAG_SIZE:]
    return GcmCiphertext(nonce=nonce, tag=tag, ciphertext=ciphertext)


def decrypt(sealed: GcmCiphertext, key: bytes, *, associated_data: bytes | None = None) -> bytes:
    """Authenticate and decrypt ``sealed``. Raises :class:`DecryptError` on tag mismatch."""
    _validate_key(key)
    if len(sealed.nonce) != NONCE_SIZE:
        raise DecryptError(f"nonce must be {NONCE_SIZE} bytes, got {len(sealed.nonce)}")
    if len(sealed.tag) != TAG_SIZE:
        raise DecryptError(f"tag must be {TAG_SIZE} bytes, got {len(sealed.tag)}")

    aead = AESGCM(bytes(key))
    try:
        return aead.decrypt(sealed.nonce, sealed.ciphertext + sealed.tag, associated_data)
    except InvalidTag as exc:
        raise DecryptError("AES-GCM tag verification failed") from exc

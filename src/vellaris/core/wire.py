"""Versioned on-wire format for AES-GCM ciphertext blobs.

Every encrypted blob produced by Vellaris carries a 1-byte version
prefix so that future schemes (ChaCha20-Poly1305, ML-KEM-wrapped DEKs,
etc.) can be added without breaking old blobs in storage. Decoders MUST
reject unknown versions rather than guessing at the layout.

Layout for ``CIPHERTEXT_V1``::

    ┌─────────┬───────────┬─────────┬──────────────┐
    │ version │  nonce    │   tag   │  ciphertext  │
    │  1 byte │ 12 bytes  │ 16 bytes│   variable   │
    └─────────┴───────────┴─────────┴──────────────┘

The tag is placed *before* the ciphertext (rather than appended) so
that a streaming reader could verify it without buffering the full
ciphertext. We don't stream in v1, but the layout is forward-friendly.
"""

from __future__ import annotations

from typing import Final

from vellaris.core.errors import WireFormatError
from vellaris.core.symmetric import NONCE_SIZE, TAG_SIZE, GcmCiphertext

CIPHERTEXT_V1: Final[int] = 0x01
"""Version byte for AES-256-GCM with the layout documented above."""

_HEADER_SIZE: Final[int] = 1 + NONCE_SIZE + TAG_SIZE


def pack(sealed: GcmCiphertext, *, version: int = CIPHERTEXT_V1) -> bytes:
    """Serialize ``sealed`` with the version-prefixed layout."""
    if version != CIPHERTEXT_V1:
        raise WireFormatError(f"unknown ciphertext version: 0x{version:02x}")
    if len(sealed.nonce) != NONCE_SIZE:
        raise WireFormatError(f"nonce must be {NONCE_SIZE} bytes, got {len(sealed.nonce)}")
    if len(sealed.tag) != TAG_SIZE:
        raise WireFormatError(f"tag must be {TAG_SIZE} bytes, got {len(sealed.tag)}")
    return bytes([version]) + sealed.nonce + sealed.tag + sealed.ciphertext


def unpack(blob: bytes) -> GcmCiphertext:
    """Parse a version-prefixed blob back into its components."""
    if not isinstance(blob, (bytes, bytearray)):
        raise WireFormatError(f"blob must be bytes, got {type(blob).__name__}")
    if len(blob) < _HEADER_SIZE:
        raise WireFormatError(f"blob too short: {len(blob)} < {_HEADER_SIZE} bytes")

    version = blob[0]
    if version != CIPHERTEXT_V1:
        raise WireFormatError(f"unknown ciphertext version: 0x{version:02x}")

    nonce = bytes(blob[1 : 1 + NONCE_SIZE])
    tag = bytes(blob[1 + NONCE_SIZE : _HEADER_SIZE])
    ciphertext = bytes(blob[_HEADER_SIZE:])
    return GcmCiphertext(nonce=nonce, tag=tag, ciphertext=ciphertext)

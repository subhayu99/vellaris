"""Ed25519 signing for the audit log.

The server signs every state-changing action's audit-log entry with an
Ed25519 key so the log can be exported, archived, and independently
verified. Ed25519 is small (32-byte public, 64-byte signature),
deterministic per (key, message), and fast — exactly what an
append-only log wants.

Keys are exchanged as raw 32-byte values (Ed25519's natural format) so
operators can paste a public key into an alert pipeline without any
PEM ceremony.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from vellaris.core.errors import KeyFormatError, SignatureError

PUBLIC_KEY_SIZE: Final[int] = 32
PRIVATE_KEY_SIZE: Final[int] = 32
SIGNATURE_SIZE: Final[int] = 64


@dataclass(frozen=True, slots=True)
class Ed25519KeyPair:
    """An Ed25519 key pair in `cryptography` object form."""

    private_key: Ed25519PrivateKey
    public_key: Ed25519PublicKey


def generate_keypair() -> Ed25519KeyPair:
    """Generate a fresh Ed25519 key pair."""
    private_key = Ed25519PrivateKey.generate()
    return Ed25519KeyPair(private_key=private_key, public_key=private_key.public_key())


def serialize_private_key(private_key: Ed25519PrivateKey) -> bytes:
    """Return the 32-byte raw private-key seed."""
    from cryptography.hazmat.primitives.serialization import (
        Encoding,
        NoEncryption,
        PrivateFormat,
    )

    return private_key.private_bytes(
        encoding=Encoding.Raw,
        format=PrivateFormat.Raw,
        encryption_algorithm=NoEncryption(),
    )


def deserialize_private_key(raw: bytes) -> Ed25519PrivateKey:
    """Load a 32-byte raw Ed25519 private key."""
    if not isinstance(raw, (bytes, bytearray)):
        raise KeyFormatError(f"private key must be bytes, got {type(raw).__name__}")
    if len(raw) != PRIVATE_KEY_SIZE:
        raise KeyFormatError(f"private key must be {PRIVATE_KEY_SIZE} bytes, got {len(raw)}")
    try:
        return Ed25519PrivateKey.from_private_bytes(bytes(raw))
    except ValueError as exc:  # pragma: no cover - cryptography accepts any 32-byte seed
        raise KeyFormatError(f"failed to load Ed25519 private key: {exc}") from exc


def serialize_public_key(public_key: Ed25519PublicKey) -> bytes:
    """Return the 32-byte raw public key."""
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    return public_key.public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw)


def deserialize_public_key(raw: bytes) -> Ed25519PublicKey:
    """Load a 32-byte raw Ed25519 public key."""
    if not isinstance(raw, (bytes, bytearray)):
        raise KeyFormatError(f"public key must be bytes, got {type(raw).__name__}")
    if len(raw) != PUBLIC_KEY_SIZE:
        raise KeyFormatError(f"public key must be {PUBLIC_KEY_SIZE} bytes, got {len(raw)}")
    try:
        return Ed25519PublicKey.from_public_bytes(bytes(raw))
    except ValueError as exc:  # pragma: no cover - cryptography accepts any 32-byte point
        raise KeyFormatError(f"failed to load Ed25519 public key: {exc}") from exc


def sign(message: bytes, private_key: Ed25519PrivateKey) -> bytes:
    """Sign ``message`` with ``private_key``. Returns a 64-byte signature."""
    return private_key.sign(message)


def verify(message: bytes, signature: bytes, public_key: Ed25519PublicKey) -> None:
    """Verify ``signature`` over ``message``. Raises :class:`SignatureError` on failure."""
    try:
        public_key.verify(signature, message)
    except InvalidSignature as exc:
        raise SignatureError("Ed25519 signature verification failed") from exc

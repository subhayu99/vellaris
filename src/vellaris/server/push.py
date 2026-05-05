"""Web Push (RFC 8030 / VAPID RFC 8292) helpers.

Phase 4 lands the cryptographic plumbing the Phase 5 sender will use:
loading the VAPID private key from disk, deriving the matching public
key in the base64url-no-padding form browsers expect, and a couple of
small utilities for the routes layer.

The Phase 5 ``send_push()`` function will live here too — for now this
module is purely about key management.
"""

from __future__ import annotations

import base64
from functools import lru_cache
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
)

from vellaris.server.config import VellarisSettings, get_settings


def _b64url_nopad(data: bytes) -> str:
    """RFC 7515 §2 base64url encoding — no padding, URL-safe alphabet."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _generate_private_key() -> ec.EllipticCurvePrivateKey:
    """Generate a fresh secp256r1 (P-256) private key. Used by the CLI."""
    return ec.generate_private_key(ec.SECP256R1())


def _serialize_private_raw(key: ec.EllipticCurvePrivateKey) -> bytes:
    """32-byte big-endian scalar — what RFC 8292 actually expects."""
    n = key.private_numbers().private_value
    return n.to_bytes(32, "big")


def _deserialize_private_raw(data: bytes) -> ec.EllipticCurvePrivateKey:
    """Inverse of :func:`_serialize_private_raw`."""
    if len(data) != 32:
        raise ValueError(f"VAPID private key must be exactly 32 bytes, got {len(data)}")
    n = int.from_bytes(data, "big")
    return ec.derive_private_key(n, ec.SECP256R1())


def _public_uncompressed(key: ec.EllipticCurvePrivateKey) -> bytes:
    """65-byte uncompressed P-256 public key (0x04 || X || Y)."""
    return key.public_key().public_bytes(
        encoding=Encoding.X962,
        format=PublicFormat.UncompressedPoint,
    )


def vapid_public_key_b64url(key: ec.EllipticCurvePrivateKey) -> str:
    """Encode the public key the way ``pushManager.subscribe`` accepts it."""
    return _b64url_nopad(_public_uncompressed(key))


def generate_vapid_key_pair() -> tuple[bytes, str]:
    """Return (raw 32-byte private key bytes, base64url public key)."""
    key = _generate_private_key()
    return _serialize_private_raw(key), vapid_public_key_b64url(key)


@lru_cache(maxsize=1)
def _load_private_key(path_str: str) -> ec.EllipticCurvePrivateKey:
    """Cache the loaded key by its file path so repeated calls are cheap."""
    return _deserialize_private_raw(Path(path_str).read_bytes())


def get_vapid_private_key(
    settings: VellarisSettings | None = None,
) -> ec.EllipticCurvePrivateKey | None:
    """Return the configured VAPID private key, or ``None`` if unset.

    Routes that need to know whether push is enabled call this and
    return ``503 Service Unavailable`` when the result is ``None``. The
    cache is keyed by path string, so reset_vapid_key_cache() is enough
    when tests swap settings.vapid_private_key_path.
    """
    s = settings or get_settings()
    if s.vapid_private_key_path is None:
        return None
    return _load_private_key(str(s.vapid_private_key_path))


def get_vapid_public_key_b64url(settings: VellarisSettings | None = None) -> str | None:
    """Convenience wrapper used by GET /notifications/public-key."""
    private = get_vapid_private_key(settings)
    if private is None:
        return None
    return vapid_public_key_b64url(private)


def reset_vapid_key_cache() -> None:
    """Tests use this when swapping settings.vapid_private_key_path."""
    _load_private_key.cache_clear()

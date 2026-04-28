"""Append-only audit log signed with the server's Ed25519 key.

The server signs every state-changing action so the log can be exported
and independently verified. The signing key is loaded from
``settings.audit_signing_key_path`` if set; otherwise a fresh in-memory
key is generated at process start (dev only — production deployments
must persist the key file).
"""

from __future__ import annotations

import json
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.core.signing import (
    deserialize_private_key,
    generate_keypair,
    serialize_public_key,
    sign,
)
from vellaris.server.config import VellarisSettings, get_settings
from vellaris.server.models import AuditAction, AuditLog


@lru_cache(maxsize=1)
def _signing_key_for(path_str: str | None) -> Ed25519PrivateKey:
    """Cache the signing key by its file path. ``None`` means dev-mode ephemeral."""
    if path_str is None:
        return generate_keypair().private_key
    raw = Path(path_str).read_bytes()
    return deserialize_private_key(raw)


def get_signing_key(settings: VellarisSettings | None = None) -> Ed25519PrivateKey:
    s = settings or get_settings()
    path = str(s.audit_signing_key_path) if s.audit_signing_key_path else None
    return _signing_key_for(path)


def get_public_key(settings: VellarisSettings | None = None) -> Ed25519PublicKey:
    return get_signing_key(settings).public_key()


def reset_signing_key_cache() -> None:
    """Tests use this when swapping audit_signing_key_path."""
    _signing_key_for.cache_clear()


def _canonical_payload(
    *,
    action: AuditAction,
    user_id: UUID | None,
    target_id: UUID | None,
    extra: dict[str, Any],
    at: datetime,
) -> bytes:
    """Build the deterministic byte sequence the server signs.

    Uses sorted-keys JSON so the same logical entry produces the same
    signature on any machine — important for log archival and verification.
    """
    payload = {
        "action": action.value,
        "user_id": str(user_id) if user_id else None,
        "target_id": str(target_id) if target_id else None,
        "extra": extra,
        "at": at.isoformat(),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


async def record(
    db: AsyncSession,
    action: AuditAction,
    *,
    user_id: UUID | None = None,
    target_id: UUID | None = None,
    extra: dict[str, Any] | None = None,
    settings: VellarisSettings | None = None,
) -> AuditLog:
    """Insert a signed audit log entry. Caller is responsible for committing."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        target_id=target_id,
        extra=extra or {},
    )
    payload = _canonical_payload(
        action=action,
        user_id=user_id,
        target_id=target_id,
        extra=entry.extra,
        at=entry.at,
    )
    entry.signature = sign(payload, get_signing_key(settings))
    db.add(entry)
    return entry


def verify_entry(entry: AuditLog, settings: VellarisSettings | None = None) -> bool:
    """Verify a stored entry's signature against the server's public key."""
    from vellaris.core.errors import SignatureError
    from vellaris.core.signing import verify

    payload = _canonical_payload(
        action=entry.action,
        user_id=entry.user_id,
        target_id=entry.target_id,
        extra=entry.extra,
        at=entry.at,
    )
    try:
        verify(payload, entry.signature, get_public_key(settings))
    except SignatureError:
        return False
    return True


def public_key_bytes(settings: VellarisSettings | None = None) -> bytes:
    """Return the server's audit-log public key as raw 32 bytes (for export)."""
    return serialize_public_key(get_public_key(settings))

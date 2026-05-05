"""Web Push (RFC 8030 / VAPID RFC 8292) helpers + sender.

The cryptographic plumbing — loading the VAPID private key from disk,
deriving the matching public key in the base64url-no-padding form
browsers expect — is shared by the routes layer and ``send_push()``.

``send_push()`` is the thing the Phase 5 share / revoke handlers fire:
JSON-encode the payload, encrypt + dispatch via ``pywebpush`` per
subscription, drop expired ones (410), audit operational failures.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
)
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush
from sqlmodel import select

from vellaris.server.audit import record as audit_record
from vellaris.server.config import VellarisSettings, get_settings
from vellaris.server.db import session_factory
from vellaris.server.models import AuditAction, PushSubscription

_log = logging.getLogger(__name__)


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
    _vapid_instance.cache_clear()


@lru_cache(maxsize=1)
def _vapid_instance(path_str: str) -> Vapid02:
    """A cached pywebpush-friendly VAPID handle for the configured key.

    pywebpush accepts a ``Vapid02`` instance OR a path. Building it once
    avoids re-deriving the public point on every push.
    """
    private = _load_private_key(path_str)
    raw = _serialize_private_raw(private)
    # Vapid02.from_raw expects a b64url-encoded private key as bytes.
    return Vapid02.from_raw(_b64url_nopad(raw).encode("ascii"))


def _subscription_keys_b64url(sub: PushSubscription) -> dict[str, str]:
    """The ``keys`` dict pywebpush wants — base64url, no padding."""
    return {
        "p256dh": _b64url_nopad(sub.p256dh_key),
        "auth": _b64url_nopad(sub.auth_secret),
    }


def _push_one(
    *,
    subscription: PushSubscription,
    payload: str,
    vapid_handle: Vapid02,
    vapid_subject: str,
    timeout: float,
) -> int | None:
    """Synchronous single-subscription dispatch.

    Returns the HTTP status of the push request on success, or the
    response status when ``WebPushException`` carries one. ``None``
    means the request never reached the push service (DNS / connect).
    """
    try:
        response = webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": _subscription_keys_b64url(subscription),
            },
            data=payload,
            vapid_private_key=vapid_handle,
            vapid_claims={"sub": vapid_subject},
            timeout=timeout,
        )
    except WebPushException as exc:
        if exc.response is not None:
            return int(exc.response.status_code)
        return None
    # webpush() with curl=False returns the requests.Response.
    return int(getattr(response, "status_code", 0))


async def send_push(
    *,
    user_id: UUID,
    payload: dict[str, Any],
    settings: VellarisSettings | None = None,
    timeout: float = 5.0,
) -> None:
    """Send a Web Push notification to all of ``user_id``'s devices.

    Fire-and-forget — callers wrap in ``asyncio.create_task`` so the
    originating HTTP request isn't blocked on slow push services. The
    function opens its own database session because the originating
    request's session is already closed by the time we run.

    Per-subscription outcomes:

      * **2xx** → delivered. ``last_used_at`` bumped.
      * **404 / 410** → push service tells us the endpoint is dead;
        delete the row so we never try again.
      * **anything else (or no response)** → audit
        ``PUSH_SEND_FAILED`` and leave the row alone; might be a
        transient outage.
    """
    s = settings or get_settings()
    if s.vapid_private_key_path is None:
        # Push disabled — silently no-op so callers don't have to guard.
        return

    serialized = json.dumps(payload, separators=(",", ":"))
    vapid_handle = _vapid_instance(str(s.vapid_private_key_path))
    loop = asyncio.get_running_loop()

    factory = session_factory()
    async with factory() as db:
        rows = (
            await db.exec(select(PushSubscription).where(PushSubscription.user_id == user_id))
        ).all()
        if not rows:
            return

        def _dispatch(sub: PushSubscription) -> int | None:
            return _push_one(
                subscription=sub,
                payload=serialized,
                vapid_handle=vapid_handle,
                vapid_subject=s.vapid_subject,
                timeout=timeout,
            )

        for sub in rows:
            status = await loop.run_in_executor(None, _dispatch, sub)

            if status is not None and 200 <= status < 300:
                from datetime import UTC, datetime

                sub.last_used_at = datetime.now(UTC)
                db.add(sub)
                continue

            if status in (404, 410):
                await db.delete(sub)
                continue

            # Anything else: log + audit + keep the row.
            _log.warning(
                "push send failed for subscription %s (status=%s)", sub.id, status
            )
            await audit_record(
                db,
                AuditAction.PUSH_SEND_FAILED,
                user_id=user_id,
                target_id=sub.id,
                extra={"status": status if status is not None else 0},
                settings=s,
            )

        await db.commit()

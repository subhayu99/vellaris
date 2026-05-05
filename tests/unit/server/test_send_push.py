"""``push.send_push`` — sender behavior with a mocked pywebpush.

The actual VAPID JWT signing + AES-GCM payload encryption live in
pywebpush; we patch ``pywebpush.webpush`` so the test exercises only the
Vellaris glue: subscription lookup, response handling, expiry cleanup,
audit-on-failure, and graceful no-op when push is disabled.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from sqlmodel import select

from vellaris.server.config import reset_settings_cache
from vellaris.server.db import session_factory
from vellaris.server.models import (
    AuditAction,
    AuditLog,
    PushSubscription,
    User,
)
from vellaris.server.push import generate_vapid_key_pair, reset_vapid_key_cache, send_push


@pytest.fixture
def vapid_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    private, _public = generate_vapid_key_pair()
    key_path = tmp_path / "vapid.key"
    key_path.write_bytes(private)
    monkeypatch.setenv("VELLARIS_VAPID_PRIVATE_KEY_PATH", str(key_path))
    monkeypatch.setenv("VELLARIS_VAPID_SUBJECT", "mailto:ops@example.com")
    reset_settings_cache()
    reset_vapid_key_cache()
    yield key_path
    reset_settings_cache()
    reset_vapid_key_cache()


def _seed_user_and_sub(server: Any) -> tuple[User, PushSubscription]:
    """Insert a user + a subscription row directly via the engine.

    The TestClient fixture sets up the DB; we use it for setup but never
    talk to it directly here — send_push opens its own session.
    """
    user = User(
        username=f"u-{uuid4().hex[:8]}",
        email=f"u-{uuid4().hex[:8]}@example.com",
        public_key=b"\x00" * 4096,
    )
    sub = PushSubscription(
        user_id=user.id,
        endpoint="https://fcm.googleapis.com/fcm/send/abc",
        p256dh_key=b"\x04" + os.urandom(64),
        auth_secret=os.urandom(16),
        user_agent="iPhone Safari",
        friendly_name="iPhone",
    )

    async def _insert() -> None:
        factory = session_factory()
        async with factory() as session:
            session.add(user)
            await session.commit()
            sub.user_id = user.id
            session.add(sub)
            await session.commit()

    asyncio.new_event_loop().run_until_complete(_insert())
    return user, sub


class _FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


class _FakeWebPushException(Exception):
    def __init__(self, status_code: int | None) -> None:
        super().__init__(f"fake webpush failure {status_code}")
        self.response = _FakeResponse(status_code) if status_code is not None else None


@pytest.fixture
def patch_webpush(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Patch pywebpush.webpush in vellaris.server.push.

    Returns a mutable spec the test mutates: status_code (or
    raise_status to make the patched function throw with that status).
    Captured calls land in the ``calls`` list.
    """
    spec: dict[str, Any] = {"status_code": 201, "raise_status": None, "calls": []}

    def fake_webpush(**kwargs: Any) -> Any:
        spec["calls"].append(kwargs)
        if spec["raise_status"] is not None:
            from vellaris.server import push as push_module

            raise push_module.WebPushException(spec["raise_status"])
        return _FakeResponse(int(spec["status_code"]))

    # Swap pywebpush's webpush + WebPushException so _push_one sees ours.
    from vellaris.server import push as push_module

    monkeypatch.setattr(push_module, "webpush", fake_webpush)
    monkeypatch.setattr(push_module, "WebPushException", _FakeWebPushException)
    return spec


# ---------- happy path ----------


def test_send_push_dispatches_to_each_subscription(
    server: Any,
    vapid_key: Path,
    patch_webpush: dict[str, Any],
) -> None:
    user, _sub = _seed_user_and_sub(server)
    patch_webpush["status_code"] = 201

    asyncio.new_event_loop().run_until_complete(
        send_push(user_id=user.id, payload={"type": "share", "from": "alice", "doc_id": "d-1"})
    )

    assert len(patch_webpush["calls"]) == 1
    call = patch_webpush["calls"][0]
    assert call["subscription_info"]["endpoint"].startswith("https://fcm.googleapis.com/")
    # Payload is JSON-serialised before reaching webpush.
    import json

    assert json.loads(call["data"]) == {"type": "share", "from": "alice", "doc_id": "d-1"}
    assert call["vapid_claims"] == {"sub": "mailto:ops@example.com"}


def test_send_push_marks_last_used_on_success(
    server: Any,
    vapid_key: Path,
    patch_webpush: dict[str, Any],
) -> None:
    user, sub = _seed_user_and_sub(server)
    patch_webpush["status_code"] = 201

    asyncio.new_event_loop().run_until_complete(
        send_push(user_id=user.id, payload={"type": "share", "from": "x", "doc_id": "y"})
    )

    async def _fetch() -> PushSubscription | None:
        factory = session_factory()
        async with factory() as session:
            return (
                await session.exec(select(PushSubscription).where(PushSubscription.id == sub.id))
            ).one_or_none()

    fresh = asyncio.new_event_loop().run_until_complete(_fetch())
    assert fresh is not None and fresh.last_used_at is not None


# ---------- 410 ⇒ delete ----------


def test_send_push_410_deletes_subscription(
    server: Any,
    vapid_key: Path,
    patch_webpush: dict[str, Any],
) -> None:
    user, sub = _seed_user_and_sub(server)
    patch_webpush["raise_status"] = 410

    asyncio.new_event_loop().run_until_complete(
        send_push(user_id=user.id, payload={"type": "share", "from": "x", "doc_id": "y"})
    )

    async def _fetch() -> PushSubscription | None:
        factory = session_factory()
        async with factory() as session:
            return (
                await session.exec(select(PushSubscription).where(PushSubscription.id == sub.id))
            ).one_or_none()

    assert asyncio.new_event_loop().run_until_complete(_fetch()) is None


# ---------- other errors ⇒ audit + survive ----------


def test_send_push_5xx_audits_and_keeps_subscription(
    server: Any,
    vapid_key: Path,
    patch_webpush: dict[str, Any],
) -> None:
    user, sub = _seed_user_and_sub(server)
    patch_webpush["raise_status"] = 502

    asyncio.new_event_loop().run_until_complete(
        send_push(user_id=user.id, payload={"type": "share", "from": "x", "doc_id": "y"})
    )

    async def _fetch_audit_and_sub() -> tuple[list[AuditLog], PushSubscription | None]:
        factory = session_factory()
        async with factory() as session:
            rows = list(
                (
                    await session.exec(
                        select(AuditLog).where(AuditLog.action == AuditAction.PUSH_SEND_FAILED)
                    )
                ).all()
            )
            still = (
                await session.exec(select(PushSubscription).where(PushSubscription.id == sub.id))
            ).one_or_none()
            return rows, still

    rows, still = asyncio.new_event_loop().run_until_complete(_fetch_audit_and_sub())
    assert len(rows) == 1
    assert rows[0].extra.get("status") == 502
    assert still is not None  # row survives the transient failure


# ---------- VAPID disabled ----------


def test_send_push_no_op_when_vapid_unset(
    server: Any,
    monkeypatch: pytest.MonkeyPatch,
    patch_webpush: dict[str, Any],
) -> None:
    monkeypatch.delenv("VELLARIS_VAPID_PRIVATE_KEY_PATH", raising=False)
    reset_settings_cache()
    reset_vapid_key_cache()

    user, _sub = _seed_user_and_sub(server)
    asyncio.new_event_loop().run_until_complete(
        send_push(user_id=user.id, payload={"type": "share", "from": "x", "doc_id": "y"})
    )
    assert patch_webpush["calls"] == []

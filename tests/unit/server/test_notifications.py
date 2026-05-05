"""Push-subscription routes — public-key, subscribe / unsubscribe / list.

The actual push *send* is a Phase 5 concern (and tested separately in
``test_push.py``); these tests cover the database-side handshake the
SPA drives at subscribe time.
"""

from __future__ import annotations

import base64
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from vellaris.core.asymmetric import RSAKeyPair, pss_sign
from vellaris.server.config import reset_settings_cache
from vellaris.server.push import (
    _serialize_private_raw,
    generate_vapid_key_pair,
    reset_vapid_key_cache,
)


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _signup(server: TestClient, username: str, public_pem: bytes) -> dict[str, Any]:
    return server.post(
        "/users",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "public_key": _b64(public_pem),
        },
    ).json()


def _login(server: TestClient, username: str, kp: RSAKeyPair) -> str:
    challenge = server.post("/auth/challenge", json={"username": username}).json()
    cid = UUID(challenge["challenge_id"])
    sig = pss_sign(cid.bytes + base64.b64decode(challenge["nonce"]), kp.private_key)
    verify = server.post("/auth/verify", json={"challenge_id": str(cid), "signature": _b64(sig)})
    return verify.json()["token"]


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _sample_subscription_body(endpoint: str = "https://fcm.googleapis.com/fcm/send/abc123") -> dict[str, Any]:
    return {
        "endpoint": endpoint,
        "p256dh_key": _b64(b"\x04" + os.urandom(64)),  # uncompressed P-256
        "auth_secret": _b64(os.urandom(16)),
        "user_agent": "iPhone Safari",
        "friendly_name": "iPhone",
    }


@pytest.fixture
def vapid_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Drop a fresh raw P-256 private key into a temp file + point settings at it."""
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


# ---------- public-key endpoint ----------


def test_public_key_503_when_vapid_unset(server: TestClient) -> None:
    res = server.get("/notifications/public-key")
    assert res.status_code == 503
    assert "disabled" in res.json()["detail"]


def test_public_key_returned_when_vapid_set(
    server: TestClient,
    vapid_key: Path,
) -> None:
    res = server.get("/notifications/public-key")
    assert res.status_code == 200, res.text
    body = res.json()
    # base64url-no-pad of an uncompressed P-256 point: ~87 chars (65 bytes → ⌈65*4/3⌉ chars).
    assert len(body["public_key"]) >= 80
    assert body["public_key"].replace("-", "+").replace("_", "/")  # valid base64url
    assert body["subject"] == "mailto:ops@example.com"


def test_public_key_matches_serialized_private(server: TestClient, vapid_key: Path) -> None:
    """Re-derive the public key locally and confirm it matches what the route returns."""
    from vellaris.server.push import _deserialize_private_raw, vapid_public_key_b64url

    raw = vapid_key.read_bytes()
    expected = vapid_public_key_b64url(_deserialize_private_raw(raw))
    res = server.get("/notifications/public-key")
    assert res.json()["public_key"] == expected
    # Sanity-check the helper round-trip too — useful when this test fails so the
    # serializer can be ruled out before chasing route bugs.
    assert _b64(_serialize_private_raw(_deserialize_private_raw(raw))) == _b64(raw)


# ---------- subscription endpoints ----------


def test_subscribe_503_when_vapid_unset(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    res = server.post(
        "/notifications/subscriptions",
        json=_sample_subscription_body(),
        headers=_bearer(token),
    )
    assert res.status_code == 503


def test_subscribe_then_list_then_unsubscribe(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    vapid_key: Path,
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    body = _sample_subscription_body()
    create = server.post(
        "/notifications/subscriptions", json=body, headers=_bearer(token)
    )
    assert create.status_code == 201, create.text
    subscription = create.json()
    assert subscription["endpoint"] == body["endpoint"]
    assert subscription["friendly_name"] == "iPhone"

    # List should now include exactly the row we just created.
    listing = server.get("/notifications/subscriptions", headers=_bearer(token))
    assert listing.status_code == 200
    items = listing.json()
    assert [it["id"] for it in items] == [subscription["id"]]
    assert items[0]["friendly_name"] == "iPhone"

    # DELETE should be 204 + listing returns empty.
    res = server.delete(
        f"/notifications/subscriptions/{subscription['id']}", headers=_bearer(token)
    )
    assert res.status_code == 204
    assert server.get("/notifications/subscriptions", headers=_bearer(token)).json() == []


def test_subscribe_is_idempotent_on_endpoint(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    vapid_key: Path,
) -> None:
    """Re-subscribing the same browser replaces the row in place."""
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    body = _sample_subscription_body()
    first = server.post(
        "/notifications/subscriptions", json=body, headers=_bearer(token)
    ).json()

    # Replay with new keys but the same endpoint → same id.
    body["p256dh_key"] = _b64(b"\x04" + os.urandom(64))
    body["friendly_name"] = "iPhone (renamed)"
    second = server.post(
        "/notifications/subscriptions", json=body, headers=_bearer(token)
    ).json()

    assert second["id"] == first["id"]
    assert second["friendly_name"] == "iPhone (renamed)"

    listing = server.get("/notifications/subscriptions", headers=_bearer(token)).json()
    assert len(listing) == 1


def test_unsubscribe_404_when_not_owned(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
    vapid_key: Path,
) -> None:
    """A subscription owned by alice is invisible/inaccessible to bob."""
    _signup(server, "alice", alice_public_pem)
    _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    sub = server.post(
        "/notifications/subscriptions",
        json=_sample_subscription_body(),
        headers=_bearer(alice_token),
    ).json()

    # Bob's listing is empty.
    assert server.get("/notifications/subscriptions", headers=_bearer(bob_token)).json() == []
    # Bob's delete attempt is 404.
    res = server.delete(
        f"/notifications/subscriptions/{sub['id']}", headers=_bearer(bob_token)
    )
    assert res.status_code == 404


def test_subscribe_records_audit(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    vapid_key: Path,
) -> None:
    """The audit log gains a PUSH_SUBSCRIBE row on a successful POST."""
    import asyncio

    from sqlmodel import select

    from vellaris.server.db import session_factory
    from vellaris.server.models import AuditAction, AuditLog

    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    server.post(
        "/notifications/subscriptions",
        json=_sample_subscription_body(),
        headers=_bearer(token),
    )

    async def _read() -> list[AuditLog]:
        factory = session_factory()
        async with factory() as session:
            return list(
                (
                    await session.exec(
                        select(AuditLog).where(AuditLog.action == AuditAction.PUSH_SUBSCRIBE)
                    )
                ).all()
            )

    rows = asyncio.new_event_loop().run_until_complete(_read())
    assert len(rows) == 1


def test_unsubscribe_records_audit(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    vapid_key: Path,
) -> None:
    """A successful DELETE writes a PUSH_UNSUBSCRIBE row."""
    import asyncio

    from sqlmodel import select

    from vellaris.server.db import session_factory
    from vellaris.server.models import AuditAction, AuditLog

    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    sub = server.post(
        "/notifications/subscriptions",
        json=_sample_subscription_body(),
        headers=_bearer(token),
    ).json()
    server.delete(f"/notifications/subscriptions/{sub['id']}", headers=_bearer(token))

    async def _read() -> list[AuditLog]:
        factory = session_factory()
        async with factory() as session:
            return list(
                (
                    await session.exec(
                        select(AuditLog).where(AuditLog.action == AuditAction.PUSH_UNSUBSCRIBE)
                    )
                ).all()
            )

    rows = asyncio.new_event_loop().run_until_complete(_read())
    assert len(rows) == 1


def test_subscribe_requires_auth(server: TestClient, vapid_key: Path) -> None:
    res = server.post(
        "/notifications/subscriptions",
        json=_sample_subscription_body(),
    )
    assert res.status_code == 401


def test_list_is_per_user(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
    vapid_key: Path,
) -> None:
    _signup(server, "alice", alice_public_pem)
    _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    server.post(
        "/notifications/subscriptions",
        json=_sample_subscription_body("https://fcm.googleapis.com/fcm/send/alice-1"),
        headers=_bearer(alice_token),
    )
    server.post(
        "/notifications/subscriptions",
        json=_sample_subscription_body("https://fcm.googleapis.com/fcm/send/bob-1"),
        headers=_bearer(bob_token),
    )

    alice_list = server.get("/notifications/subscriptions", headers=_bearer(alice_token)).json()
    bob_list = server.get("/notifications/subscriptions", headers=_bearer(bob_token)).json()
    assert len(alice_list) == 1
    assert len(bob_list) == 1
    assert alice_list[0]["id"] != bob_list[0]["id"]

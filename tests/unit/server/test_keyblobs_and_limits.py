"""Key-blob sync round-trip + upload-size cap + rate limit."""

from __future__ import annotations

import base64
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from vellaris.core.asymmetric import RSAKeyPair, pss_sign


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _signup(server: TestClient, username: str, public_pem: bytes) -> dict:  # type: ignore[type-arg]
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


def _bearer(t: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {t}"}


# ---------- key-blobs ----------


def test_keyblob_push_pull_round_trip(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    blob = b"\x01wrapped-private-key-bytes"
    push = server.put("/key-blobs/me", json={"wrapped_key": _b64(blob)}, headers=_bearer(token))
    assert push.status_code == 200
    pull = server.get("/key-blobs/me", headers=_bearer(token))
    assert pull.status_code == 200
    assert base64.b64decode(pull.json()["wrapped_key"]) == blob


def test_keyblob_overwrite(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    server.put("/key-blobs/me", json={"wrapped_key": _b64(b"old")}, headers=_bearer(token))
    server.put("/key-blobs/me", json={"wrapped_key": _b64(b"new")}, headers=_bearer(token))
    pull = server.get("/key-blobs/me", headers=_bearer(token))
    assert base64.b64decode(pull.json()["wrapped_key"]) == b"new"


def test_keyblob_pull_when_missing_404(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    assert server.get("/key-blobs/me", headers=_bearer(token)).status_code == 404


def test_keyblob_delete(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    server.put("/key-blobs/me", json={"wrapped_key": _b64(b"x")}, headers=_bearer(token))
    out = server.delete("/key-blobs/me", headers=_bearer(token))
    assert out.status_code == 204
    assert server.get("/key-blobs/me", headers=_bearer(token)).status_code == 404


def test_keyblob_requires_auth(server: TestClient) -> None:
    assert server.get("/key-blobs/me").status_code == 401
    assert server.delete("/key-blobs/me").status_code == 401


# ---------- upload-size cap ----------


@pytest.fixture
def small_upload_server(
    tmp_path: pytest.TempPathFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> TestClient:
    """Build a server with a tiny upload cap so we can trigger 413."""
    db_path = tmp_path / "small.db"  # type: ignore[operator]
    blob_root = tmp_path / "blobs"  # type: ignore[operator]
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("VELLARIS_BLOB_URL", f"file://{blob_root.as_posix()}")  # type: ignore[union-attr]
    monkeypatch.setenv("VELLARIS_MAX_UPLOAD_BYTES", "100")  # tiny

    from vellaris.server.config import reset_settings_cache
    from vellaris.server.db import create_all, reset_engine_cache
    from vellaris.server.storage_factory import reset_blob_store_cache

    reset_settings_cache()
    reset_engine_cache()
    reset_blob_store_cache()

    import asyncio

    asyncio.new_event_loop().run_until_complete(create_all())

    from vellaris.server.app import create_app

    return TestClient(create_app())


def test_upload_size_cap_returns_413(small_upload_server: TestClient) -> None:
    huge = "x" * 5000
    resp = small_upload_server.post("/users", content=huge)
    assert resp.status_code == 413
    assert "too large" in resp.json()["detail"]


# ---------- rate limit ----------


def test_rate_limit_returns_429(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Configure a tiny burst and confirm the N+1 request is rejected."""
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'rl.db'}")
    monkeypatch.setenv("VELLARIS_BLOB_URL", f"file://{(tmp_path / 'blobs').as_posix()}")
    monkeypatch.setenv("VELLARIS_RATE_LIMIT_PER_MINUTE", "1")
    monkeypatch.setenv("VELLARIS_RATE_LIMIT_BURST", "2")

    from vellaris.server.config import reset_settings_cache
    from vellaris.server.db import create_all, reset_engine_cache
    from vellaris.server.storage_factory import reset_blob_store_cache

    reset_settings_cache()
    reset_engine_cache()
    reset_blob_store_cache()

    import asyncio

    asyncio.new_event_loop().run_until_complete(create_all())

    from vellaris.server.app import create_app

    client = TestClient(create_app())

    # /healthz is exempt — it shouldn't count.
    for _ in range(20):
        client.get("/healthz")

    # Two challenge requests (within burst) succeed → 404 (user not found).
    a = client.post("/auth/challenge", json={"username": "x"})
    b = client.post("/auth/challenge", json={"username": "x"})
    # Third should be rate-limited (burst=2, then refill at 1/min ≈ negligible).
    c = client.post("/auth/challenge", json={"username": "x"})
    assert a.status_code in (404, 422)
    assert b.status_code in (404, 422)
    assert c.status_code == 429
    assert "rate limit exceeded" in c.json()["detail"]

"""End-to-end of signup + challenge-response login + /users/me + logout."""

from __future__ import annotations

import base64
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from vellaris.core.asymmetric import RSAKeyPair, pss_sign


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _signup_body(username: str, public_pem: bytes, *, email: str | None = None) -> dict[str, str]:
    return {
        "username": username,
        "email": email or f"{username}@example.com",
        "public_key": _b64(public_pem),
    }


# ---------- signup ----------


def test_signup_succeeds(server: TestClient, alice_public_pem: bytes) -> None:
    resp = server.post("/users", json=_signup_body("alice", alice_public_pem))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["username"] == "alice"
    assert body["email"] == "alice@example.com"
    assert UUID(body["id"])  # parses


def test_signup_duplicate_rejected(server: TestClient, alice_public_pem: bytes) -> None:
    server.post("/users", json=_signup_body("dup", alice_public_pem))
    resp = server.post(
        "/users", json=_signup_body("dup", alice_public_pem, email="other@example.com")
    )
    assert resp.status_code == 409


def test_signup_rejects_invalid_public_key(server: TestClient) -> None:
    body = {"username": "x", "email": "x@example.com", "public_key": _b64(b"not-a-pem")}
    resp = server.post("/users", json=body)
    assert resp.status_code == 400
    assert "invalid public key" in resp.json()["detail"]


def test_signup_rejects_bad_username(server: TestClient, alice_public_pem: bytes) -> None:
    body = _signup_body("a b c", alice_public_pem)  # space disallowed by pattern
    resp = server.post("/users", json=body)
    assert resp.status_code == 422


# ---------- login (challenge / verify) ----------


def _login(client: TestClient, username: str, kp: RSAKeyPair) -> str:
    """Run the challenge-response flow and return the bearer token."""
    challenge = client.post("/auth/challenge", json={"username": username}).json()
    challenge_id = UUID(challenge["challenge_id"])
    nonce = base64.b64decode(challenge["nonce"])
    signature = pss_sign(challenge_id.bytes + nonce, kp.private_key)

    verify = client.post(
        "/auth/verify",
        json={"challenge_id": str(challenge_id), "signature": _b64(signature)},
    )
    assert verify.status_code == 200, verify.text
    return verify.json()["token"]


def test_full_login_round_trip(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    server.post("/users", json=_signup_body("alice", alice_public_pem))
    token = _login(server, "alice", alice_keypair)

    me = server.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


def test_challenge_for_unknown_user_404(server: TestClient) -> None:
    resp = server.post("/auth/challenge", json={"username": "ghost"})
    assert resp.status_code == 404


def test_verify_with_wrong_signature_rejected(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
) -> None:
    server.post("/users", json=_signup_body("alice", alice_public_pem))
    challenge = server.post("/auth/challenge", json={"username": "alice"}).json()
    challenge_id = UUID(challenge["challenge_id"])
    nonce = base64.b64decode(challenge["nonce"])
    # Sign with the WRONG private key.
    bad_sig = pss_sign(challenge_id.bytes + nonce, bob_keypair.private_key)
    resp = server.post(
        "/auth/verify",
        json={"challenge_id": str(challenge_id), "signature": _b64(bad_sig)},
    )
    assert resp.status_code == 401


def test_challenge_is_single_use(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    server.post("/users", json=_signup_body("alice", alice_public_pem))
    challenge = server.post("/auth/challenge", json={"username": "alice"}).json()
    cid = UUID(challenge["challenge_id"])
    nonce = base64.b64decode(challenge["nonce"])
    sig = pss_sign(cid.bytes + nonce, alice_keypair.private_key)
    payload = {"challenge_id": str(cid), "signature": _b64(sig)}

    first = server.post("/auth/verify", json=payload)
    second = server.post("/auth/verify", json=payload)
    assert first.status_code == 200
    assert second.status_code == 404  # consumed


def test_verify_unknown_challenge_404(server: TestClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    sig = _b64(b"\x00" * 512)
    resp = server.post("/auth/verify", json={"challenge_id": fake_id, "signature": sig})
    assert resp.status_code == 404


# ---------- protected routes ----------


def test_me_requires_token(server: TestClient) -> None:
    resp = server.get("/users/me")
    assert resp.status_code == 401
    assert "missing bearer token" in resp.json()["detail"]


def test_me_rejects_bad_token(server: TestClient) -> None:
    resp = server.get("/users/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401
    assert "invalid or expired" in resp.json()["detail"]


def test_logout_revokes_token(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    server.post("/users", json=_signup_body("alice", alice_public_pem))
    token = _login(server, "alice", alice_keypair)
    headers = {"Authorization": f"Bearer {token}"}

    assert server.get("/users/me", headers=headers).status_code == 200
    out = server.post("/auth/logout", headers=headers)
    assert out.status_code == 204
    # After logout, the same token must fail.
    assert server.get("/users/me", headers=headers).status_code == 401


# ---------- public lookup ----------


def test_lookup_by_id_and_by_username(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_public_pem: bytes,
) -> None:
    alice = server.post("/users", json=_signup_body("alice", alice_public_pem)).json()
    server.post("/users", json=_signup_body("bob", bob_public_pem))

    token = _login(server, "alice", alice_keypair)
    headers = {"Authorization": f"Bearer {token}"}

    by_un = server.get("/users/by-username/bob", headers=headers)
    assert by_un.status_code == 200
    assert by_un.json()["username"] == "bob"
    # Public profile must NOT include email.
    assert "email" not in by_un.json()

    by_id = server.get(f"/users/by-id/{alice['id']}", headers=headers)
    assert by_id.status_code == 200
    assert by_id.json()["id"] == alice["id"]
    assert "email" not in by_id.json()


def test_lookup_unknown_user_404(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    server.post("/users", json=_signup_body("alice", alice_public_pem))
    token = _login(server, "alice", alice_keypair)
    headers = {"Authorization": f"Bearer {token}"}
    assert server.get("/users/by-username/ghost", headers=headers).status_code == 404


# ---------- expired challenge ----------


def test_expired_challenge_410(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Force a tiny challenge TTL and verify expiry returns 410."""
    monkeypatch.setenv("VELLARIS_CHALLENGE_TTL_SECONDS", "10")
    # The TTL is read fresh per request via Depends(get_settings); we still need
    # to clear the lru_cache.
    from vellaris.server.config import reset_settings_cache

    reset_settings_cache()

    server.post("/users", json=_signup_body("alice", alice_public_pem))

    challenge = server.post("/auth/challenge", json={"username": "alice"}).json()
    cid = UUID(challenge["challenge_id"])
    nonce = base64.b64decode(challenge["nonce"])
    sig = pss_sign(cid.bytes + nonce, alice_keypair.private_key)

    # Manually backdate the challenge in the database to simulate expiry.
    import asyncio
    from datetime import UTC, datetime, timedelta

    from sqlmodel import select

    from vellaris.server.db import session_factory
    from vellaris.server.models import AuthChallenge

    async def _expire() -> None:
        async with session_factory()() as db:
            row = (await db.exec(select(AuthChallenge).where(AuthChallenge.id == cid))).one()
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            db.add(row)
            await db.commit()

    asyncio.get_event_loop_policy().new_event_loop().run_until_complete(_expire())

    resp = server.post("/auth/verify", json={"challenge_id": str(cid), "signature": _b64(sig)})
    assert resp.status_code == 410

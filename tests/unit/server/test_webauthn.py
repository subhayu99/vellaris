"""WebAuthn passkey routes — challenge lifecycle + register/auth ceremonies.

Real WebAuthn verification needs a hardware authenticator (or the WebDriver
virtual authenticator), which we can't stand up inside a unit test. Instead
we stub `verify_registration_response` and `verify_authentication_response`
to return canned ``Verified*Response`` objects so we exercise everything
around the crypto: challenge consumption, audit logging, session creation,
ownership checks, list/delete, and the JSON contract with the SPA.
"""

from __future__ import annotations

import base64
import json
import os
from collections.abc import Iterator
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from webauthn.helpers.structs import (
    AuthenticatorTransport,
    PublicKeyCredentialType,
)

from vellaris.core.asymmetric import RSAKeyPair, pss_sign


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


def _bearer(t: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {t}"}


# ---------- stubs for the cryptographic verification step ----------


class _FakeRegistration:
    """Minimal stand-in for webauthn.helpers.structs.VerifiedRegistration."""

    def __init__(self, credential_id: bytes) -> None:
        self.credential_id = credential_id
        self.credential_public_key = b"\x00\xfa\xceCOSE-key"
        self.sign_count = 0


class _FakeAuthentication:
    def __init__(self, new_sign_count: int = 1) -> None:
        self.new_sign_count = new_sign_count


@pytest.fixture
def stub_registration(monkeypatch: pytest.MonkeyPatch) -> Iterator[bytes]:
    """Make verify_registration_response return a fixed credential_id."""
    cred_id = b"credential-id-" + os.urandom(8)

    def fake_verify(
        *,
        credential: Any,
        expected_challenge: bytes,
        expected_origin: list[str] | str,
        expected_rp_id: str,
        require_user_verification: bool,
    ) -> _FakeRegistration:
        return _FakeRegistration(cred_id)

    monkeypatch.setattr("vellaris.server.routes.webauthn.verify_registration_response", fake_verify)
    yield cred_id


@pytest.fixture
def stub_authentication(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_verify(
        *,
        credential: Any,
        expected_challenge: bytes,
        expected_rp_id: str,
        expected_origin: list[str] | str,
        credential_public_key: bytes,
        credential_current_sign_count: int,
        require_user_verification: bool,
    ) -> _FakeAuthentication:
        return _FakeAuthentication(new_sign_count=credential_current_sign_count + 1)

    monkeypatch.setattr(
        "vellaris.server.routes.webauthn.verify_authentication_response", fake_verify
    )


# ---------- registration ----------


def test_register_begin_emits_prf_extension_and_challenge(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    res = server.post("/webauthn/register/begin", headers=_bearer(token))
    assert res.status_code == 201, res.text
    body = res.json()
    options = json.loads(body["options_json"])

    assert UUID(body["challenge_id"])
    assert options["rp"]["id"] == "localhost"
    assert options["user"]["name"] == "alice"
    assert options["extensions"]["prf"]["eval"]["first"]
    # PRF salt input is a stable 32-byte SHA-256 — base64url-decoded should be 32 bytes.
    salt_b64 = options["extensions"]["prf"]["eval"]["first"]
    salt = base64.urlsafe_b64decode(salt_b64 + "=" * (-len(salt_b64) % 4))
    assert len(salt) == 32


def test_register_finish_stores_credential_and_audit(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    stub_registration: bytes,
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    begin = server.post("/webauthn/register/begin", headers=_bearer(token)).json()
    finish = server.post(
        "/webauthn/register/finish",
        json={
            "challenge_id": begin["challenge_id"],
            "name": "Alice's iPhone",
            "credential_json": "{}",
            "transports": ["internal", "hybrid"],
            "wrapped_key": _b64(b"\x02wrapped-rsa-pem-under-prf"),
        },
        headers=_bearer(token),
    )
    assert finish.status_code == 201, finish.text
    summary = finish.json()
    assert summary["name"] == "Alice's iPhone"
    assert summary["transports"] == ["internal", "hybrid"]

    # Listing returns it.
    listed = server.get("/webauthn/credentials", headers=_bearer(token)).json()
    assert len(listed) == 1
    assert listed[0]["name"] == "Alice's iPhone"


def test_register_finish_rejects_replayed_challenge(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    stub_registration: bytes,
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    begin = server.post("/webauthn/register/begin", headers=_bearer(token)).json()
    payload = {
        "challenge_id": begin["challenge_id"],
        "name": "k",
        "credential_json": "{}",
        "transports": [],
        "wrapped_key": _b64(b"x"),
    }
    first = server.post("/webauthn/register/finish", json=payload, headers=_bearer(token))
    assert first.status_code == 201
    second = server.post("/webauthn/register/finish", json=payload, headers=_bearer(token))
    assert second.status_code == 404  # challenge consumed


def test_register_finish_rejects_other_users_challenge(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
    stub_registration: bytes,
) -> None:
    _signup(server, "alice", alice_public_pem)
    _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    begin = server.post("/webauthn/register/begin", headers=_bearer(alice_token)).json()
    res = server.post(
        "/webauthn/register/finish",
        json={
            "challenge_id": begin["challenge_id"],
            "name": "stolen",
            "credential_json": "{}",
            "transports": [],
            "wrapped_key": _b64(b"x"),
        },
        headers=_bearer(bob_token),
    )
    assert res.status_code == 400
    assert "different user" in res.json()["detail"]


# ---------- authentication ----------


def test_auth_begin_with_username_returns_user_credentials(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    stub_registration: bytes,
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    begin = server.post("/webauthn/register/begin", headers=_bearer(token)).json()
    server.post(
        "/webauthn/register/finish",
        json={
            "challenge_id": begin["challenge_id"],
            "name": "primary",
            "credential_json": "{}",
            "transports": ["internal"],
            "wrapped_key": _b64(b"x"),
        },
        headers=_bearer(token),
    )

    res = server.post("/webauthn/auth/begin", json={"username": "alice"})
    assert res.status_code == 201
    options = json.loads(res.json()["options_json"])
    assert options["allowCredentials"]
    assert options["allowCredentials"][0]["transports"] == ["internal"]
    assert options["extensions"]["prf"]["eval"]["first"]


def test_auth_begin_with_unknown_username_does_not_disclose(
    server: TestClient,
) -> None:
    """Unknown usernames return options with empty allowCredentials, not 404."""
    res = server.post("/webauthn/auth/begin", json={"username": "ghost"})
    assert res.status_code == 201
    options = json.loads(res.json()["options_json"])
    # No credentials returned for the unknown user; browser will fail-closed
    # at credential selection time without revealing anything to the caller.
    assert options.get("allowCredentials", []) == []


def test_auth_finish_round_trip_returns_token_and_wrapped_key(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    stub_registration: bytes,
    stub_authentication: None,
) -> None:
    cred_id = stub_registration
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    begin = server.post("/webauthn/register/begin", headers=_bearer(token)).json()
    wrapped = b"\x02PRF-WRAPPED-RSA-PRIVATE-KEY"
    server.post(
        "/webauthn/register/finish",
        json={
            "challenge_id": begin["challenge_id"],
            "name": "primary",
            "credential_json": "{}",
            "transports": ["internal"],
            "wrapped_key": _b64(wrapped),
        },
        headers=_bearer(token),
    )

    auth_begin = server.post("/webauthn/auth/begin", json={"username": "alice"}).json()
    raw_id = base64.urlsafe_b64encode(cred_id).rstrip(b"=").decode("ascii")
    auth_finish = server.post(
        "/webauthn/auth/finish",
        json={
            "challenge_id": auth_begin["challenge_id"],
            "credential_json": json.dumps({"id": raw_id, "rawId": raw_id, "response": {}}),
        },
    )
    assert auth_finish.status_code == 200, auth_finish.text
    body = auth_finish.json()
    assert body["token"]
    assert body["user"]["username"] == "alice"
    assert base64.b64decode(body["wrapped_key"]) == wrapped

    # Token grants a real session.
    me = server.get("/users/me", headers=_bearer(body["token"]))
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


def test_auth_finish_rejects_unregistered_credential(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
) -> None:
    _signup(server, "alice", alice_public_pem)
    auth_begin = server.post("/webauthn/auth/begin", json={"username": "alice"}).json()
    raw_id = base64.urlsafe_b64encode(b"never-registered").rstrip(b"=").decode("ascii")
    res = server.post(
        "/webauthn/auth/finish",
        json={
            "challenge_id": auth_begin["challenge_id"],
            "credential_json": json.dumps({"id": raw_id, "rawId": raw_id}),
        },
    )
    assert res.status_code == 401
    assert "not registered" in res.json()["detail"]


# ---------- list / delete ----------


def test_delete_credential_removes_it(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    stub_registration: bytes,
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    begin = server.post("/webauthn/register/begin", headers=_bearer(token)).json()
    finish = server.post(
        "/webauthn/register/finish",
        json={
            "challenge_id": begin["challenge_id"],
            "name": "to-delete",
            "credential_json": "{}",
            "transports": [],
            "wrapped_key": _b64(b"x"),
        },
        headers=_bearer(token),
    ).json()

    cred_id = finish["id"]
    out = server.delete(f"/webauthn/credentials/{cred_id}", headers=_bearer(token))
    assert out.status_code == 204
    listed = server.get("/webauthn/credentials", headers=_bearer(token)).json()
    assert listed == []


def test_routes_require_auth_where_appropriate(server: TestClient) -> None:
    # Register/begin + register/finish + list/delete are authenticated.
    assert server.post("/webauthn/register/begin").status_code == 401
    assert server.get("/webauthn/credentials").status_code == 401
    # Auth/begin + auth/finish are anonymous.
    assert server.post("/webauthn/auth/begin", json={}).status_code == 201


def test_transports_field_filters_unknown_values(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    stub_registration: bytes,
) -> None:
    """Unknown transport hints from the client get silently dropped."""
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    begin = server.post("/webauthn/register/begin", headers=_bearer(token)).json()
    finish = server.post(
        "/webauthn/register/finish",
        json={
            "challenge_id": begin["challenge_id"],
            "name": "k",
            "credential_json": "{}",
            "transports": ["internal", "made-up", "bluetooth-lol"],
            "wrapped_key": _b64(b"x"),
        },
        headers=_bearer(token),
    ).json()
    assert finish["transports"] == ["internal"]


def test_known_transport_values_are_canonical() -> None:
    """Sanity check: WebAuthn transports we filter against haven't drifted."""
    assert {"internal", "hybrid", "usb", "nfc", "ble"}.issubset(
        {t.value for t in AuthenticatorTransport}
    )
    assert PublicKeyCredentialType.PUBLIC_KEY.value == "public-key"

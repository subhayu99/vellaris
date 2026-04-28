"""End-to-end flow + the zero-knowledge property the marketing page promises.

We instrument the test client to capture every outgoing request body and
every incoming response body, then run the canonical flow:

    alice signs up
    bob signs up
    alice uploads a doc shared with bob
    bob lists, downloads, decrypts → matches the original plaintext
    alice revokes bob → bob can't download anymore

After the flow, we grep every captured body for sentinel values that
must never travel over the wire (the plaintext, alice's passphrase,
the unwrapped private key bytes). Zero hits is the bar.
"""

from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from starlette.types import Message

from vellaris.core.asymmetric import (
    generate_keypair,
    oaep_decrypt,
    oaep_encrypt,
    pss_sign,
    serialize_private_key,
    serialize_public_key,
)
from vellaris.core.symmetric import decrypt as aes_decrypt
from vellaris.core.symmetric import encrypt as aes_encrypt
from vellaris.core.symmetric import random_key
from vellaris.core.wire import pack, unpack
from vellaris.server.config import reset_settings_cache
from vellaris.server.db import create_all, reset_engine_cache
from vellaris.server.storage_factory import reset_blob_store_cache

ALICE_PASSPHRASE = b"\x9c-correct-horse-battery-staple-9b3c2f1a"
SECRET_PLAINTEXT = b"VELLARIS_E2E_PLAINTEXT_SENTINEL_xqz"


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _b64d(s: str) -> bytes:
    return base64.b64decode(s)


@pytest.fixture
def captured_server(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[TestClient, list[bytes]]:
    """A TestClient whose middleware captures every request + response body verbatim."""
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'e2e.db'}")
    monkeypatch.setenv("VELLARIS_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("VELLARIS_RATE_LIMIT_PER_MINUTE", "10000")  # disable throttling
    monkeypatch.setenv("VELLARIS_RATE_LIMIT_BURST", "10000")
    reset_settings_cache()
    reset_engine_cache()
    reset_blob_store_cache()
    asyncio.new_event_loop().run_until_complete(create_all())

    from vellaris.server.app import create_app

    app = create_app()
    captured: list[bytes] = []

    @app.middleware("http")
    async def _capture(request, call_next):  # type: ignore[no-untyped-def]
        # Buffer the request body and re-inject it so the route still sees it.
        body = await request.body()
        if body:
            captured.append(body)

        async def _receive() -> Message:
            return {"type": "http.request", "body": body, "more_body": False}

        request._receive = _receive  # type: ignore[attr-defined]
        response = await call_next(request)

        # Capture the response body too.
        chunks: list[bytes] = []

        async def _send_chunks() -> None:
            async for chunk in response.body_iterator:
                chunks.append(chunk)

        await _send_chunks()
        merged = b"".join(chunks)
        if merged:
            captured.append(merged)

        from starlette.responses import Response as _Resp

        return _Resp(
            content=merged,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )

    return TestClient(app), captured


def test_full_flow_zero_knowledge(captured_server: tuple[TestClient, list[bytes]]) -> None:
    server, captured = captured_server

    # --- alice + bob set up keys client-side ---
    alice = generate_keypair()
    bob = generate_keypair()
    alice_pem = serialize_public_key(alice.public_key)
    bob_pem = serialize_public_key(bob.public_key)
    alice_priv_pem = serialize_private_key(alice.private_key)

    # --- signup ---
    a = server.post(
        "/users",
        json={
            "username": "alice-e2e",
            "email": "alice-e2e@example.com",
            "public_key": _b64(alice_pem),
        },
    ).json()
    b = server.post(
        "/users",
        json={
            "username": "bob-e2e",
            "email": "bob-e2e@example.com",
            "public_key": _b64(bob_pem),
        },
    ).json()
    alice_id = UUID(a["id"])
    bob_id = UUID(b["id"])

    # --- alice logs in via challenge-response ---
    challenge = server.post("/auth/challenge", json={"username": "alice-e2e"}).json()
    cid = UUID(challenge["challenge_id"])
    sig = pss_sign(cid.bytes + _b64d(challenge["nonce"]), alice.private_key)
    alice_token = server.post(
        "/auth/verify",
        json={"challenge_id": str(cid), "signature": _b64(sig)},
    ).json()["token"]

    # --- alice encrypts client-side ---
    dek = random_key()
    sealed = aes_encrypt(SECRET_PLAINTEXT, dek)
    blob = pack(sealed)
    enc_filename = pack(aes_encrypt(b"contract.pdf", dek))

    body = {
        "encrypted_filename": _b64(enc_filename),
        "content_hash": "sha256:e2e",
        "ciphertext": _b64(blob),
        "access": [
            {"user_id": str(alice_id), "encrypted_dek": _b64(oaep_encrypt(dek, alice.public_key))},
            {"user_id": str(bob_id), "encrypted_dek": _b64(oaep_encrypt(dek, bob.public_key))},
        ],
    }

    up = server.post("/documents", json=body, headers={"Authorization": f"Bearer {alice_token}"})
    assert up.status_code == 201
    doc_id = up.json()["id"]

    # --- bob logs in and downloads ---
    bob_chal = server.post("/auth/challenge", json={"username": "bob-e2e"}).json()
    bcid = UUID(bob_chal["challenge_id"])
    bsig = pss_sign(bcid.bytes + _b64d(bob_chal["nonce"]), bob.private_key)
    bob_token = server.post(
        "/auth/verify",
        json={"challenge_id": str(bcid), "signature": _b64(bsig)},
    ).json()["token"]

    listing = server.get(
        "/documents?scope=shared", headers={"Authorization": f"Bearer {bob_token}"}
    ).json()
    assert any(d["id"] == doc_id for d in listing)

    dl = server.get(f"/documents/{doc_id}", headers={"Authorization": f"Bearer {bob_token}"}).json()
    inner_dek = oaep_decrypt(_b64d(dl["encrypted_dek"]), bob.private_key)
    plaintext = aes_decrypt(unpack(_b64d(dl["ciphertext"])), inner_dek)
    assert plaintext == SECRET_PLAINTEXT  # bob can read it

    # --- alice revokes bob ---
    rev = server.delete(
        f"/documents/{doc_id}/access/{bob_id}",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert rev.status_code == 204
    after = server.get(f"/documents/{doc_id}", headers={"Authorization": f"Bearer {bob_token}"})
    assert after.status_code == 404  # post-revoke

    # --- zero-knowledge assertions ---
    # The plaintext, the passphrase, and the unwrapped private key MUST never
    # appear in any request body or response body — encrypted blobs only.
    secrets_that_must_not_leak: list[bytes] = [
        SECRET_PLAINTEXT,
        ALICE_PASSPHRASE,
        alice_priv_pem,
        # Even substrings of the key shouldn't sneak through.
        alice_priv_pem[100:200],
    ]
    for needle in secrets_that_must_not_leak:
        for body_bytes in captured:
            # Direct match on the raw body.
            assert needle not in body_bytes, (
                f"plaintext sentinel leaked into a request/response body: "
                f"first 50 bytes were {body_bytes[:50]!r}"
            )
            # Also check inside any base64 payload — decoding every JSON field
            # to be extra sure encrypted-DEK/ciphertext/etc. don't accidentally
            # carry plaintext.
            try:
                obj = json.loads(body_bytes)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            for value in _flatten_strings(obj):
                try:
                    decoded = base64.b64decode(value, validate=True)
                except (ValueError, TypeError):
                    continue
                assert needle not in decoded, (
                    "sentinel found inside base64-decoded JSON field; the server "
                    "appears to be returning plaintext"
                )


def _flatten_strings(obj: object) -> list[str]:
    """Yield every string leaf in a JSON-decoded object (response payload)."""
    out: list[str] = []
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            out.extend(_flatten_strings(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(_flatten_strings(v))
    return out

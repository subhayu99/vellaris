"""Document upload, share, list, download, revoke, delete via HTTP."""

from __future__ import annotations

import base64
from typing import Any
from uuid import UUID

from fastapi.testclient import TestClient

from vellaris.core.asymmetric import RSAKeyPair, oaep_encrypt, pss_sign
from vellaris.core.symmetric import encrypt as aes_encrypt
from vellaris.core.symmetric import random_key
from vellaris.core.wire import pack


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _b64d(s: str) -> bytes:
    return base64.b64decode(s)


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
    sig = pss_sign(cid.bytes + _b64d(challenge["nonce"]), kp.private_key)
    verify = server.post("/auth/verify", json={"challenge_id": str(cid), "signature": _b64(sig)})
    return verify.json()["token"]


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _upload_payload(
    *,
    plaintext: bytes,
    owner_id: UUID,
    owner_kp: RSAKeyPair,
    recipients: list[tuple[UUID, RSAKeyPair]] | None = None,
) -> tuple[dict[str, Any], bytes]:
    """Build a /documents POST body where the test acts as the encrypting client."""
    dek = random_key()
    sealed = aes_encrypt(plaintext, dek)
    blob = pack(sealed)
    enc_filename = aes_encrypt(b"secret.pdf", dek)

    grants = [
        {
            "user_id": str(owner_id),
            "encrypted_dek": _b64(oaep_encrypt(dek, owner_kp.public_key)),
        }
    ]
    for uid, kp in recipients or []:
        grants.append(
            {"user_id": str(uid), "encrypted_dek": _b64(oaep_encrypt(dek, kp.public_key))}
        )

    return (
        {
            "encrypted_filename": _b64(pack(enc_filename)),
            "content_hash": "sha256:fakehash",
            "ciphertext": _b64(blob),
            "access": grants,
        },
        dek,
    )


def test_upload_and_self_download(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    body, dek = _upload_payload(
        plaintext=b"contract terms here",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
    )
    up = server.post("/documents", json=body, headers=_bearer(token))
    assert up.status_code == 201, up.text
    doc_id = up.json()["id"]

    dl = server.get(f"/documents/{doc_id}", headers=_bearer(token))
    assert dl.status_code == 200
    payload = dl.json()
    assert payload["owner_id"] == alice["id"]

    # Round-trip through real crypto: server is just bytes-shuffling here.
    from vellaris.core.asymmetric import oaep_decrypt
    from vellaris.core.symmetric import decrypt as aes_decrypt
    from vellaris.core.wire import unpack

    inner_dek = oaep_decrypt(_b64d(payload["encrypted_dek"]), alice_keypair.private_key)
    assert inner_dek == dek
    plaintext = aes_decrypt(unpack(_b64d(payload["ciphertext"])), inner_dek)
    assert plaintext == b"contract terms here"


def test_upload_requires_owner_in_access(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    body, _ = _upload_payload(plaintext=b"x", owner_id=UUID(alice["id"]), owner_kp=alice_keypair)
    body["access"] = []  # owner not in list
    resp = server.post("/documents", json=body, headers=_bearer(token))
    assert resp.status_code == 422  # Pydantic min_length=1 catches this first


def test_upload_rejects_unknown_recipient(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    body, _ = _upload_payload(plaintext=b"x", owner_id=UUID(alice["id"]), owner_kp=alice_keypair)
    # Add a phantom user ID.
    body["access"].append({"user_id": str(UUID(int=0)), "encrypted_dek": _b64(b"\x00" * 64)})
    resp = server.post("/documents", json=body, headers=_bearer(token))
    assert resp.status_code == 400
    assert "unknown recipient" in resp.json()["detail"]


def test_share_and_recipient_can_download(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    # Alice uploads, sharing with bob from the start.
    body, dek = _upload_payload(
        plaintext=b"shared secret",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
        recipients=[(UUID(bob["id"]), bob_keypair)],
    )
    up = server.post("/documents", json=body, headers=_bearer(alice_token))
    assert up.status_code == 201
    doc_id = up.json()["id"]

    # Bob downloads.
    dl = server.get(f"/documents/{doc_id}", headers=_bearer(bob_token))
    assert dl.status_code == 200

    from vellaris.core.asymmetric import oaep_decrypt
    from vellaris.core.symmetric import decrypt as aes_decrypt
    from vellaris.core.wire import unpack

    inner_dek = oaep_decrypt(_b64d(dl.json()["encrypted_dek"]), bob_keypair.private_key)
    assert inner_dek == dek
    plaintext = aes_decrypt(unpack(_b64d(dl.json()["ciphertext"])), inner_dek)
    assert plaintext == b"shared secret"


def test_revoke_blocks_recipient_download(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    body, _ = _upload_payload(
        plaintext=b"secret",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
        recipients=[(UUID(bob["id"]), bob_keypair)],
    )
    doc_id = server.post("/documents", json=body, headers=_bearer(alice_token)).json()["id"]
    assert server.get(f"/documents/{doc_id}", headers=_bearer(bob_token)).status_code == 200

    rev = server.delete(f"/documents/{doc_id}/access/{bob['id']}", headers=_bearer(alice_token))
    assert rev.status_code == 204
    assert server.get(f"/documents/{doc_id}", headers=_bearer(bob_token)).status_code == 404


def test_owner_cannot_revoke_self(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)

    body, _ = _upload_payload(plaintext=b"x", owner_id=UUID(alice["id"]), owner_kp=alice_keypair)
    doc_id = server.post("/documents", json=body, headers=_bearer(token)).json()["id"]

    resp = server.delete(f"/documents/{doc_id}/access/{alice['id']}", headers=_bearer(token))
    assert resp.status_code == 400


def test_share_after_upload(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
) -> None:
    """Share a doc with a new user post-upload."""
    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    body, dek = _upload_payload(
        plaintext=b"only-mine-for-now",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
    )
    doc_id = server.post("/documents", json=body, headers=_bearer(alice_token)).json()["id"]

    # Bob can't download yet.
    assert server.get(f"/documents/{doc_id}", headers=_bearer(bob_token)).status_code == 404

    # Alice grants access.
    enc_dek_for_bob = oaep_encrypt(dek, bob_keypair.public_key)
    grant = server.post(
        f"/documents/{doc_id}/access",
        json={"user_id": bob["id"], "encrypted_dek": _b64(enc_dek_for_bob)},
        headers=_bearer(alice_token),
    )
    assert grant.status_code == 204
    assert server.get(f"/documents/{doc_id}", headers=_bearer(bob_token)).status_code == 200


def test_list_documents_scopes(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    # Alice uploads two docs, sharing one with bob.
    body1, _ = _upload_payload(plaintext=b"a", owner_id=UUID(alice["id"]), owner_kp=alice_keypair)
    body2, _ = _upload_payload(
        plaintext=b"b",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
        recipients=[(UUID(bob["id"]), bob_keypair)],
    )
    server.post("/documents", json=body1, headers=_bearer(alice_token))
    server.post("/documents", json=body2, headers=_bearer(alice_token))

    # Bob uploads one for himself.
    body3, _ = _upload_payload(
        plaintext=b"bob-only", owner_id=UUID(bob["id"]), owner_kp=bob_keypair
    )
    server.post("/documents", json=body3, headers=_bearer(bob_token))

    # Bob: mine = 1, shared = 1, all = 2
    mine = server.get("/documents?scope=mine", headers=_bearer(bob_token)).json()
    shared = server.get("/documents?scope=shared", headers=_bearer(bob_token)).json()
    all_ = server.get("/documents?scope=all", headers=_bearer(bob_token)).json()
    assert len(mine) == 1
    assert len(shared) == 1
    assert len(all_) == 2

    # Alice: mine = 2, shared = 0, all = 2
    a_mine = server.get("/documents?scope=mine", headers=_bearer(alice_token)).json()
    a_shared = server.get("/documents?scope=shared", headers=_bearer(alice_token)).json()
    a_all = server.get("/documents?scope=all", headers=_bearer(alice_token)).json()
    assert len(a_mine) == 2
    assert len(a_shared) == 0
    assert len(a_all) == 2


def test_delete_document_owner(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    body, _ = _upload_payload(
        plaintext=b"ephemeral",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
        recipients=[(UUID(bob["id"]), bob_keypair)],
    )
    doc_id = server.post("/documents", json=body, headers=_bearer(alice_token)).json()["id"]

    # Bob (recipient, not owner) cannot delete.
    bad = server.delete(f"/documents/{doc_id}", headers=_bearer(bob_token))
    assert bad.status_code == 404

    # Alice deletes.
    out = server.delete(f"/documents/{doc_id}", headers=_bearer(alice_token))
    assert out.status_code == 204

    # Subsequent download by anyone returns 404.
    assert server.get(f"/documents/{doc_id}", headers=_bearer(alice_token)).status_code == 404
    assert server.get(f"/documents/{doc_id}", headers=_bearer(bob_token)).status_code == 404


def test_download_requires_auth(server: TestClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    assert server.get(f"/documents/{fake_id}").status_code == 401


def test_invalid_scope_rejected(
    server: TestClient, alice_keypair: RSAKeyPair, alice_public_pem: bytes
) -> None:
    _signup(server, "alice", alice_public_pem)
    token = _login(server, "alice", alice_keypair)
    resp = server.get("/documents?scope=garbage", headers=_bearer(token))
    assert resp.status_code == 400


def test_owner_sees_access_list_in_download(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)

    body, _ = _upload_payload(
        plaintext=b"shared",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
        recipients=[(UUID(bob["id"]), bob_keypair)],
    )
    doc_id = server.post("/documents", json=body, headers=_bearer(alice_token)).json()["id"]

    payload = server.get(f"/documents/{doc_id}", headers=_bearer(alice_token)).json()
    access = payload.get("access")
    assert access is not None, "owner must see the access list"
    by_uid = {grant["user_id"]: grant for grant in access}
    assert by_uid[alice["id"]]["username"] == "alice"
    assert by_uid[bob["id"]]["username"] == "bob"
    assert len(access) == 2


def test_non_owner_sees_access_null(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)
    bob_token = _login(server, "bob", bob_keypair)

    body, _ = _upload_payload(
        plaintext=b"shared",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
        recipients=[(UUID(bob["id"]), bob_keypair)],
    )
    doc_id = server.post("/documents", json=body, headers=_bearer(alice_token)).json()["id"]

    payload = server.get(f"/documents/{doc_id}", headers=_bearer(bob_token)).json()
    assert payload["access"] is None


def test_access_list_reflects_share_and_revoke(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
) -> None:
    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)

    body, dek = _upload_payload(
        plaintext=b"only-mine-for-now",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
    )
    doc_id = server.post("/documents", json=body, headers=_bearer(alice_token)).json()["id"]

    initial = server.get(f"/documents/{doc_id}", headers=_bearer(alice_token)).json()
    assert {g["username"] for g in initial["access"]} == {"alice"}

    enc_dek_for_bob = oaep_encrypt(dek, bob_keypair.public_key)
    server.post(
        f"/documents/{doc_id}/access",
        json={"user_id": bob["id"], "encrypted_dek": _b64(enc_dek_for_bob)},
        headers=_bearer(alice_token),
    )

    after_share = server.get(f"/documents/{doc_id}", headers=_bearer(alice_token)).json()
    assert {g["username"] for g in after_share["access"]} == {"alice", "bob"}

    server.delete(
        f"/documents/{doc_id}/access/{bob['id']}",
        headers=_bearer(alice_token),
    )

    after_revoke = server.get(f"/documents/{doc_id}", headers=_bearer(alice_token)).json()
    assert {g["username"] for g in after_revoke["access"]} == {"alice"}


# ---------- Phase 5: share / revoke fire push ----------


def test_share_fires_push_to_grantee(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
    monkeypatch: Any,
) -> None:
    """Sharing a doc fires `send_push(user_id=grantee, payload={type:share,...})`."""
    import asyncio

    calls: list[dict[str, Any]] = []

    async def fake_send_push(*, user_id: Any, payload: dict[str, Any], **_: Any) -> None:
        calls.append({"user_id": str(user_id), "payload": payload})

    monkeypatch.setattr("vellaris.server.routes.documents.send_push", fake_send_push)

    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)

    body, dek = _upload_payload(
        plaintext=b"hi",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
    )
    doc_id = server.post("/documents", json=body, headers=_bearer(alice_token)).json()["id"]

    enc_dek_for_bob = oaep_encrypt(dek, bob_keypair.public_key)
    res = server.post(
        f"/documents/{doc_id}/access",
        json={"user_id": bob["id"], "encrypted_dek": _b64(enc_dek_for_bob)},
        headers=_bearer(alice_token),
    )
    assert res.status_code == 204

    # asyncio.create_task() schedules on the running loop; under TestClient
    # the request handler ran in its own loop. Drain pending tasks so the
    # fake_send_push side-effect lands.
    loop = asyncio.new_event_loop()
    loop.run_until_complete(asyncio.sleep(0.05))
    loop.close()

    assert len(calls) == 1
    assert calls[0]["user_id"] == bob["id"]
    assert calls[0]["payload"] == {
        "type": "share",
        "from": "alice",
        "doc_id": doc_id,
    }


def test_revoke_fires_push_to_revokee(
    server: TestClient,
    alice_keypair: RSAKeyPair,
    alice_public_pem: bytes,
    bob_keypair: RSAKeyPair,
    bob_public_pem: bytes,
    monkeypatch: Any,
) -> None:
    import asyncio

    calls: list[dict[str, Any]] = []

    async def fake_send_push(*, user_id: Any, payload: dict[str, Any], **_: Any) -> None:
        calls.append({"user_id": str(user_id), "payload": payload})

    monkeypatch.setattr("vellaris.server.routes.documents.send_push", fake_send_push)

    alice = _signup(server, "alice", alice_public_pem)
    bob = _signup(server, "bob", bob_public_pem)
    alice_token = _login(server, "alice", alice_keypair)

    body, _ = _upload_payload(
        plaintext=b"x",
        owner_id=UUID(alice["id"]),
        owner_kp=alice_keypair,
        recipients=[(UUID(bob["id"]), bob_keypair)],
    )
    doc_id = server.post("/documents", json=body, headers=_bearer(alice_token)).json()["id"]

    res = server.delete(f"/documents/{doc_id}/access/{bob['id']}", headers=_bearer(alice_token))
    assert res.status_code == 204

    loop = asyncio.new_event_loop()
    loop.run_until_complete(asyncio.sleep(0.05))
    loop.close()

    assert len(calls) == 1
    assert calls[0]["user_id"] == bob["id"]
    assert calls[0]["payload"] == {
        "type": "revoke",
        "from": "alice",
        "doc_id": doc_id,
    }

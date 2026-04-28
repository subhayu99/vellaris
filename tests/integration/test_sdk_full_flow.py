"""SDK integration: alice + bob drive every operation against an in-process server.

Uses :class:`httpx.ASGITransport` so the SDK talks directly to the FastAPI
app — no real socket. Each test gets a fresh DB + blob root + key store.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest

from vellaris.client import AsyncClient
from vellaris.client.keystore import KeyStore
from vellaris.core.kdf import Argon2Params

CHEAP = Argon2Params(memory_cost_kib=8, time_cost=1, parallelism=1, key_length=32)


@pytest.fixture
async def server_app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[object]:
    """Build a FastAPI app pointing at per-test SQLite + blob_root + VELLARIS_HOME."""
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'sdk.db'}")
    monkeypatch.setenv("VELLARIS_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("VELLARIS_HOME", str(tmp_path / "vellaris"))

    # Import inside fixture so monkey-patched env is picked up.
    from vellaris.server.config import reset_settings_cache
    from vellaris.server.db import create_all, drop_all, reset_engine_cache
    from vellaris.server.storage_factory import reset_blob_store_cache

    reset_settings_cache()
    reset_engine_cache()
    reset_blob_store_cache()

    await create_all()

    from vellaris.server.app import create_app

    yield create_app()

    await drop_all()
    reset_engine_cache()
    reset_settings_cache()
    reset_blob_store_cache()


def _transport(app: object) -> httpx.AsyncBaseTransport:
    return httpx.ASGITransport(app=app)  # type: ignore[arg-type]


async def _alice_keystore(tmp_path: Path) -> KeyStore:
    return KeyStore(root=tmp_path / "alice-vellaris")


async def _bob_keystore(tmp_path: Path) -> KeyStore:
    return KeyStore(root=tmp_path / "bob-vellaris")


async def test_full_alice_bob_flow(server_app: object, tmp_path: Path) -> None:
    alice_ks = await _alice_keystore(tmp_path)
    bob_ks = await _bob_keystore(tmp_path)

    # --- alice signs up + uploads a doc shared with bob ---
    async with AsyncClient(
        "http://test", transport=_transport(server_app), keystore=alice_ks
    ) as alice:
        await alice.signup(
            username="alice-i", email="alice-i@example.com", passphrase="alice-pp", kdf_params=CHEAP
        )
        await alice.login("alice-i", "alice-pp")
        # Bob doesn't exist yet, so create him via a separate transient client.

    async with AsyncClient("http://test", transport=_transport(server_app), keystore=bob_ks) as bob:
        await bob.signup(
            username="bob-i", email="bob-i@example.com", passphrase="bob-pp", kdf_params=CHEAP
        )

    # Alice logs in and uploads a doc shared with bob.
    src = tmp_path / "secret.txt"
    src.write_bytes(b"shared-secret-via-sdk")

    async with AsyncClient(
        "http://test", transport=_transport(server_app), keystore=alice_ks
    ) as alice:
        await alice.login("alice-i", "alice-pp")
        result = await alice.push(src, share_with=["bob-i"])
        doc_id = result["id"]

    # Bob logs in, lists, pulls, decrypts.
    from uuid import UUID

    async with AsyncClient("http://test", transport=_transport(server_app), keystore=bob_ks) as bob:
        await bob.login("bob-i", "bob-pp")
        listed = await bob.list_docs(scope="shared")
        assert any(d["id"] == doc_id for d in listed)
        decrypted = await bob.pull(UUID(doc_id))
        assert decrypted.filename == "secret.txt"
        assert decrypted.plaintext == b"shared-secret-via-sdk"

    # Alice revokes bob.
    async with AsyncClient(
        "http://test", transport=_transport(server_app), keystore=alice_ks
    ) as alice:
        await alice.login("alice-i", "alice-pp")
        await alice.revoke_document(UUID(doc_id), "bob-i")

    # Bob can no longer pull.
    async with AsyncClient("http://test", transport=_transport(server_app), keystore=bob_ks) as bob:
        await bob.login("bob-i", "bob-pp")
        from vellaris.client import VellarisAPIError

        with pytest.raises(VellarisAPIError) as exc_info:
            await bob.pull(UUID(doc_id))
        assert exc_info.value.status_code == 404


async def test_keyblob_sync_round_trip(server_app: object, tmp_path: Path) -> None:
    """Push the wrapped blob to the server and pull it back into a fresh keystore."""
    from uuid import UUID

    original_ks = KeyStore(root=tmp_path / "original-vellaris")

    # 1) Sign up alice; the wrapped blob lands in original_ks.
    async with AsyncClient(
        "http://test", transport=_transport(server_app), keystore=original_ks
    ) as alice:
        await alice.signup(
            username="alice-kb",
            email="alice-kb@example.com",
            passphrase="pp",
            kdf_params=CHEAP,
        )
        await alice.login("alice-kb", "pp")
        await alice.push_keyblob()
        user_id = UUID(alice.user["id"])  # type: ignore[index]
        original_blob = original_ks.read_blob(user_id)

    # 2) Simulate "second device": empty keystore, but we still have the
    #    server-side blob. Log in by re-using the original keystore (a real
    #    second device would carry the original key file by hand once first),
    #    then pull into a fresh keystore.
    fresh_ks = KeyStore(root=tmp_path / "fresh-vellaris")
    async with AsyncClient(
        "http://test", transport=_transport(server_app), keystore=original_ks
    ) as alice:
        await alice.login("alice-kb", "pp")
        # Now ask the server for the blob and store it in the fresh keystore.
        alice_with_fresh = AsyncClient(
            "http://test",
            transport=_transport(server_app),
            keystore=fresh_ks,
            token=alice.token,
        )
        try:
            alice_with_fresh.set_user(alice.user)
            await alice_with_fresh.pull_keyblob(user_id=user_id)
        finally:
            await alice_with_fresh.close()

    assert fresh_ks.read_blob(user_id) == original_blob

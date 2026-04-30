"""Shared fixtures for the test suite.

Each server test gets a fresh on-disk SQLite database (in a per-test
temp dir), a fresh FastAPI app, and an httpx TestClient. We use a
file-backed DB rather than ``:memory:`` because aiosqlite opens a new
connection per session and an in-memory DB is dropped when the last
connection closes — the create_all run wouldn't survive into the
request handler.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from vellaris.core.asymmetric import (
    RSAKeyPair,
    generate_keypair,
    serialize_public_key,
)

# Importing models here ensures SQLModel.metadata is populated before any
# create_all() runs in the per-test fixture. Without this the first test
# creates a DB with zero tables.
from vellaris.server import models as _models  # noqa: F401
from vellaris.server.config import reset_settings_cache
from vellaris.server.db import create_all, drop_all, reset_engine_cache
from vellaris.server.storage_factory import reset_blob_store_cache


@pytest.fixture
def server(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Build a fresh FastAPI app + per-test SQLite file + ready-to-go TestClient."""
    db_path = tmp_path / "vellaris-test.db"
    blob_root = tmp_path / "blobs"
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("VELLARIS_BLOB_URL", f"file://{blob_root.as_posix()}")
    reset_settings_cache()
    reset_engine_cache()
    reset_blob_store_cache()

    asyncio.new_event_loop().run_until_complete(create_all())

    from vellaris.server.app import create_app

    app = create_app()
    with TestClient(app) as client:
        yield client

    asyncio.new_event_loop().run_until_complete(drop_all())
    reset_engine_cache()
    reset_settings_cache()
    reset_blob_store_cache()


# A module-scoped RSA keypair for tests that need it. Generating RSA-4096
# is ~0.5-1s, so we share one instance per test module.
@pytest.fixture(scope="module")
def alice_keypair() -> RSAKeyPair:
    return generate_keypair()


@pytest.fixture(scope="module")
def bob_keypair() -> RSAKeyPair:
    return generate_keypair()


@pytest.fixture(scope="module")
def alice_public_pem(alice_keypair: RSAKeyPair) -> bytes:
    return serialize_public_key(alice_keypair.public_key)


@pytest.fixture(scope="module")
def bob_public_pem(bob_keypair: RSAKeyPair) -> bytes:
    return serialize_public_key(bob_keypair.public_key)

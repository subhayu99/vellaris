"""Audit log: signed entries verify; tampered entries don't."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from sqlmodel import select

from vellaris.core.signing import generate_keypair, serialize_private_key
from vellaris.server.audit import (
    public_key_bytes,
    record,
    reset_signing_key_cache,
    verify_entry,
)
from vellaris.server.config import VellarisSettings, reset_settings_cache
from vellaris.server.db import (
    create_all,
    drop_all,
    reset_engine_cache,
    session_factory,
)
from vellaris.server.models import AuditAction, AuditLog


@pytest.fixture(autouse=True)
def _isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'audit.db'}")
    reset_settings_cache()
    reset_engine_cache()
    reset_signing_key_cache()


async def test_record_inserts_signed_entry() -> None:
    await create_all()
    user_id = uuid4()
    target_id = uuid4()

    async with session_factory()() as s:
        entry = await record(
            s,
            AuditAction.DOCUMENT_UPLOAD,
            user_id=user_id,
            target_id=target_id,
            extra={"size": 1024},
        )
        await s.commit()
        assert entry.signature
        assert len(entry.signature) == 64  # Ed25519

    async with session_factory()() as s:
        loaded = (await s.exec(select(AuditLog))).one()
        assert verify_entry(loaded) is True
    await drop_all()


async def test_tampering_invalidates_signature() -> None:
    await create_all()
    async with session_factory()() as s:
        entry = await record(
            s, AuditAction.USER_SIGNUP, user_id=uuid4(), extra={"username": "alice"}
        )
        await s.commit()
        await s.refresh(entry)

    async with session_factory()() as s:
        loaded = (await s.exec(select(AuditLog))).one()
        loaded.extra = {"username": "eve"}  # tamper
        # Don't commit — just verify the in-memory entry.
        assert verify_entry(loaded) is False
    await drop_all()


async def test_signing_key_persists_across_calls(tmp_path: Path) -> None:
    """If audit_signing_key_path is set, the same key is reused on every call."""
    key_file = tmp_path / "audit.key"
    key_file.write_bytes(serialize_private_key(generate_keypair().private_key))

    settings = VellarisSettings(_env_file=None, audit_signing_key_path=key_file)  # type: ignore[call-arg]
    a = public_key_bytes(settings)
    b = public_key_bytes(settings)
    assert a == b


async def test_dev_mode_generates_fresh_ephemeral_key() -> None:
    """No path configured -> in-memory key (cached for the process)."""
    settings = VellarisSettings(_env_file=None, audit_signing_key_path=None)  # type: ignore[call-arg]
    a = public_key_bytes(settings)
    b = public_key_bytes(settings)
    assert a == b  # cached so still the same within a process
    assert len(a) == 32


async def test_canonical_payload_is_stable(tmp_path: Path) -> None:
    """Re-recording the exact same logical entry must produce the same signature."""
    key_file = tmp_path / "stable.key"
    key_file.write_bytes(serialize_private_key(generate_keypair().private_key))
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setenv("VELLARIS_AUDIT_SIGNING_KEY_PATH", str(key_file))
    reset_settings_cache()
    reset_signing_key_cache()
    try:
        await create_all()
        target_id = uuid4()
        from datetime import UTC, datetime

        from vellaris.server.audit import _canonical_payload  # type: ignore[attr-defined]

        at = datetime(2026, 1, 1, tzinfo=UTC)
        a = _canonical_payload(
            action=AuditAction.DOCUMENT_SHARE,
            user_id=None,
            target_id=target_id,
            extra={"to": "bob", "via": "username"},
            at=at,
        )
        b = _canonical_payload(
            action=AuditAction.DOCUMENT_SHARE,
            user_id=None,
            target_id=target_id,
            extra={"via": "username", "to": "bob"},  # different insertion order
            at=at,
        )
        assert a == b  # sort_keys ensures stability
        await drop_all()
    finally:
        monkeypatch.undo()

"""Models register with SQLModel.metadata and round-trip on a real engine."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.server.config import VellarisSettings
from vellaris.server.db import (
    create_all,
    drop_all,
    get_engine,
    reset_engine_cache,
    session_factory,
)
from vellaris.server.models import (
    AuditAction,
    AuditLog,
    AuthChallenge,
    Document,
    DocumentAccess,
    KeyBlob,
    Session,
    User,
)


@pytest.fixture
async def engine(monkeypatch: pytest.MonkeyPatch) -> AsyncEngine:
    """Fresh in-memory db per test."""
    reset_engine_cache()
    monkeypatch.setenv("VELLARIS_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    s = VellarisSettings(_env_file=None)  # type: ignore[call-arg]
    eng = get_engine(s)
    await create_all(eng)
    yield eng
    await drop_all(eng)


async def _session(engine: AsyncEngine) -> AsyncSession:
    return session_factory(engine)()


async def test_user_round_trip(engine: AsyncEngine) -> None:
    user = User(username="alice", email="alice@example.com", public_key=b"PEM-bytes-here")
    async with session_factory(engine)() as s:
        s.add(user)
        await s.commit()
        await s.refresh(user)
        assert user.id is not None
        assert user.created_at.tzinfo is not None

        loaded = (await s.exec(select(User).where(User.username == "alice"))).one()
        assert loaded.email == "alice@example.com"


async def test_session_round_trip(engine: AsyncEngine) -> None:
    user = User(username="u", email="u@x", public_key=b"k")
    async with session_factory(engine)() as s:
        s.add(user)
        await s.commit()
        await s.refresh(user)

        session = Session(
            token="opaque-token-xyz",
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(hours=8),
        )
        s.add(session)
        await s.commit()

        loaded = (await s.exec(select(Session).where(Session.token == "opaque-token-xyz"))).one()
        assert loaded.user_id == user.id


async def test_document_with_access_rows(engine: AsyncEngine) -> None:
    async with session_factory(engine)() as s:
        owner = User(username="owner", email="o@x", public_key=b"k")
        recipient = User(username="recip", email="r@x", public_key=b"k")
        s.add_all([owner, recipient])
        await s.commit()
        await s.refresh(owner)
        await s.refresh(recipient)

        doc = Document(
            owner_id=owner.id,
            ciphertext_size=1024,
            encrypted_filename=b"encrypted-name",
            content_hash="sha256:abc123",
            blob_key="blobs/abc/def",
        )
        s.add(doc)
        await s.commit()
        await s.refresh(doc)

        # Two access rows: owner + recipient.
        s.add_all(
            [
                DocumentAccess(
                    document_id=doc.id,
                    user_id=owner.id,
                    encrypted_dek=b"owner-wrapped-dek",
                    granted_by=owner.id,
                ),
                DocumentAccess(
                    document_id=doc.id,
                    user_id=recipient.id,
                    encrypted_dek=b"recipient-wrapped-dek",
                    granted_by=owner.id,
                ),
            ]
        )
        await s.commit()

        rows = (
            await s.exec(select(DocumentAccess).where(DocumentAccess.document_id == doc.id))
        ).all()
        assert len(rows) == 2


async def test_audit_log_with_extra_json(engine: AsyncEngine) -> None:
    async with session_factory(engine)() as s:
        user = User(username="auditor", email="a@x", public_key=b"k")
        s.add(user)
        await s.commit()
        await s.refresh(user)

        entry = AuditLog(
            user_id=user.id,
            action=AuditAction.USER_LOGIN,
            extra={"ip_hash": "abc", "agent_hash": "def"},
            signature=b"ed25519-sig",
        )
        s.add(entry)
        await s.commit()

        loaded = (await s.exec(select(AuditLog))).one()
        assert loaded.action == AuditAction.USER_LOGIN
        assert loaded.extra["ip_hash"] == "abc"


async def test_keyblob_and_challenge_tables_exist(engine: AsyncEngine) -> None:
    """Ensure the remaining two tables can be inserted into."""
    async with session_factory(engine)() as s:
        u = User(username="x", email="x@x", public_key=b"k")
        s.add(u)
        await s.commit()
        await s.refresh(u)

        s.add(KeyBlob(user_id=u.id, wrapped_key=b"wrapped"))
        s.add(
            AuthChallenge(
                user_id=u.id,
                nonce=b"random-bytes",
                expires_at=datetime.now(UTC) + timedelta(minutes=5),
            )
        )
        await s.commit()

        kb = (await s.exec(select(KeyBlob).where(KeyBlob.user_id == u.id))).one()
        assert kb.wrapped_key == b"wrapped"
        ch = (await s.exec(select(AuthChallenge).where(AuthChallenge.user_id == u.id))).one()
        assert ch.nonce == b"random-bytes"


async def test_username_uniqueness_enforced(engine: AsyncEngine) -> None:
    """Two users with the same username should fail at commit."""
    from sqlalchemy.exc import IntegrityError

    async with session_factory(engine)() as s:
        s.add(User(username="dup", email="a@x", public_key=b"k"))
        await s.commit()

    async with session_factory(engine)() as s:
        s.add(User(username="dup", email="b@x", public_key=b"k"))
        with pytest.raises(IntegrityError):
            await s.commit()

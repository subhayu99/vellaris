"""Opaque session token generation + lookup helpers."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.server.config import VellarisSettings, get_settings
from vellaris.server.models import Session, User

TOKEN_NBYTES = 32  # 256 bits of entropy → 43-char base64url string


def new_token() -> str:
    """Return a fresh URL-safe opaque session token."""
    return secrets.token_urlsafe(TOKEN_NBYTES)


async def create_session(
    db: AsyncSession,
    user: User,
    *,
    settings: VellarisSettings | None = None,
    ip_hash: str | None = None,
    user_agent_hash: str | None = None,
) -> Session:
    """Insert a new authenticated session row and return it (uncommitted)."""
    s = settings or get_settings()
    session = Session(
        token=new_token(),
        user_id=user.id,
        expires_at=datetime.now(UTC) + timedelta(seconds=s.session_ttl_seconds),
        ip_hash=ip_hash,
        user_agent_hash=user_agent_hash,
    )
    db.add(session)
    return session


async def get_session_by_token(db: AsyncSession, token: str) -> Session | None:
    """Look up a non-expired session by its opaque token."""
    now = datetime.now(UTC)
    stmt = select(Session).where(Session.token == token, Session.expires_at > now)
    result = await db.exec(stmt)
    return result.one_or_none()


async def revoke_session(db: AsyncSession, token: str) -> bool:
    """Delete a session by token. Returns True if it existed, False otherwise."""
    stmt = select(Session).where(Session.token == token)
    session = (await db.exec(stmt)).one_or_none()
    if session is None:
        return False
    await db.delete(session)
    return True


async def touch_session(db: AsyncSession, session: Session) -> None:
    """Update last_used_at on a live session."""
    session.last_used_at = datetime.now(UTC)
    db.add(session)


async def load_user(db: AsyncSession, user_id: UUID) -> User | None:
    stmt = select(User).where(User.id == user_id, User.deleted_at.is_(None))  # type: ignore[union-attr]
    return (await db.exec(stmt)).one_or_none()

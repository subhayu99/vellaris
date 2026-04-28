"""Async SQLAlchemy/SQLModel engine + session helpers.

Builds an :class:`AsyncEngine` from :class:`VellarisSettings` and exposes
:func:`get_session` as a FastAPI dependency that yields an
:class:`AsyncSession` and rolls back on exception. Schema lives in the
SQLModel metadata; Alembic migrations are the only path that mutates
tables in production.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.server.config import VellarisSettings, get_settings


@lru_cache(maxsize=1)
def _engine_from_url(url: str, *, echo: bool) -> AsyncEngine:
    """Build the async engine. Cached per-URL so repeated dependency calls reuse it."""
    return create_async_engine(url, echo=echo, future=True)


def get_engine(settings: VellarisSettings | None = None) -> AsyncEngine:
    """Return the engine for ``settings`` (defaults to the global cached settings)."""
    s = settings or get_settings()
    return _engine_from_url(s.database_url, echo=s.database_echo)


def reset_engine_cache() -> None:
    """Clear the engine cache. Tests use this when swapping database URLs."""
    _engine_from_url.cache_clear()


def session_factory(engine: AsyncEngine | None = None) -> async_sessionmaker[AsyncSession]:
    """Return a session factory bound to ``engine`` (or the default engine)."""
    return async_sessionmaker(
        engine or get_engine(),
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding an :class:`AsyncSession`.

    Rolls back on any exception that propagates through the request handler;
    commit is the route's responsibility (we never auto-commit on success
    because that would hide subtle ordering bugs in audit-log writes).
    """
    factory = session_factory()
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def create_all(engine: AsyncEngine | None = None) -> None:
    """Create every SQLModel table. Used by tests; production runs Alembic."""
    eng = engine or get_engine()
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def drop_all(engine: AsyncEngine | None = None) -> None:
    """Drop every SQLModel table. Used by tests for teardown."""
    eng = engine or get_engine()
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)

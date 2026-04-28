"""Engine + session helpers work against an in-memory aiosqlite database."""

from __future__ import annotations

import pytest

from vellaris.server.config import VellarisSettings
from vellaris.server.db import (
    create_all,
    drop_all,
    get_engine,
    reset_engine_cache,
    session_factory,
)


@pytest.fixture(autouse=True)
def _isolate_engine_cache() -> None:
    reset_engine_cache()


def test_engine_for_url_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    s = VellarisSettings(_env_file=None)  # type: ignore[call-arg]
    a = get_engine(s)
    b = get_engine(s)
    assert a is b


def test_engine_url_change_yields_new_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    a = get_engine(VellarisSettings(_env_file=None))  # type: ignore[call-arg]
    monkeypatch.setenv("VELLARIS_DATABASE_URL", "sqlite+aiosqlite:///./other.db")
    b = get_engine(VellarisSettings(_env_file=None))  # type: ignore[call-arg]
    assert a is not b


async def test_create_all_drop_all_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    """create_all then drop_all both succeed against an empty SQLModel registry."""
    monkeypatch.setenv("VELLARIS_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    s = VellarisSettings(_env_file=None)  # type: ignore[call-arg]
    engine = get_engine(s)
    await create_all(engine)
    await drop_all(engine)


async def test_session_factory_yields_usable_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    s = VellarisSettings(_env_file=None)  # type: ignore[call-arg]
    factory = session_factory(get_engine(s))
    async with factory() as session:
        # exec a trivial statement to confirm the connection works
        from sqlalchemy import text

        result = await session.exec(text("SELECT 1"))  # type: ignore[call-overload]
        assert result.scalar_one() == 1

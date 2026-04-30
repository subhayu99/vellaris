"""Auto-migrate runs alembic upgrade head in-process."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

from vellaris.server._migrate import upgrade_to_head


def test_upgrade_to_head_creates_tables(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "test.db"
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{db}")
    from vellaris.server.config import reset_settings_cache

    reset_settings_cache()

    upgrade_to_head()

    # Open a sync connection and assert the schema landed.
    sync_eng = create_engine(f"sqlite:///{db}")
    inspector = inspect(sync_eng)
    tables = set(inspector.get_table_names())
    assert "users" in tables  # one of the SQLModel tables
    assert "alembic_version" in tables


def test_upgrade_to_head_is_idempotent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "test.db"
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{db}")
    from vellaris.server.config import reset_settings_cache

    reset_settings_cache()

    upgrade_to_head()
    upgrade_to_head()  # second run should be a no-op
    sync_eng = create_engine(f"sqlite:///{db}")
    inspector = inspect(sync_eng)
    assert "alembic_version" in inspector.get_table_names()

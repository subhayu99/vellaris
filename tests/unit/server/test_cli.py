"""CLI startup — driver check + auto-migrate flag handling."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from vellaris.server import cli
from vellaris.server._drivers import DriverNotInstalledError


def test_check_drivers_raises_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    monkeypatch.setitem(sys.modules, "asyncpg", None)
    from vellaris.server.config import reset_settings_cache

    reset_settings_cache()
    with pytest.raises(DriverNotInstalledError):
        cli._check_drivers()


def test_auto_migrate_runs_when_enabled(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "test.db"
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{db}")
    monkeypatch.setenv("VELLARIS_AUTO_MIGRATE", "1")
    from vellaris.server.config import reset_settings_cache

    reset_settings_cache()

    called: list[bool] = []

    def fake_uvicorn_run(*args: object, **kwargs: object) -> None:
        called.append(True)

    monkeypatch.setattr("uvicorn.run", fake_uvicorn_run)
    cli.main()
    assert db.is_file()
    assert called == [True]


def test_auto_migrate_skipped_when_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = tmp_path / "test.db"
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{db}")
    monkeypatch.setenv("VELLARIS_AUTO_MIGRATE", "0")
    from vellaris.server.config import reset_settings_cache

    reset_settings_cache()

    monkeypatch.setattr("uvicorn.run", lambda *a, **k: None)
    cli.main()
    # DB file should not exist because no migration ran
    assert not db.exists()


def test_migrate_subcommand_runs_alembic(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "migrate-sub.db"
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite+aiosqlite:///{db}")
    from vellaris.server.config import reset_settings_cache

    reset_settings_cache()

    monkeypatch.setattr("sys.argv", ["vellaris-server", "migrate"])
    # uvicorn.run should NOT be called when running the migrate subcommand.
    monkeypatch.setattr("uvicorn.run", lambda *a, **k: pytest.fail("uvicorn.run was called"))
    cli.main()
    assert db.is_file()

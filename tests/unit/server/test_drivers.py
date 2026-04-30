"""Driver-presence detection for VELLARIS_DATABASE_URL."""

from __future__ import annotations

import sys

import pytest

from vellaris.server._drivers import (
    DriverNotInstalledError,
    check_async_driver,
    driver_for_url,
)


def test_driver_for_sqlite_url() -> None:
    assert driver_for_url("sqlite+aiosqlite:///./vellaris.db") == ("aiosqlite", "sqlite")


def test_driver_for_postgres_url() -> None:
    assert driver_for_url("postgresql+asyncpg://u:p@h/db") == ("asyncpg", "postgres")


def test_driver_for_mysql_url() -> None:
    assert driver_for_url("mysql+asyncmy://u:p@h/db") == ("asyncmy", "mysql")


def test_driver_for_unknown_dialect_raises() -> None:
    with pytest.raises(ValueError, match="cannot infer async driver"):
        driver_for_url("oracle+cx_oracle://...")


def test_check_async_driver_passes_when_installed() -> None:
    check_async_driver("sqlite+aiosqlite:///./test.db")  # aiosqlite is in [dev]


def test_check_async_driver_raises_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    # Pretend asyncpg is not importable.
    monkeypatch.setitem(sys.modules, "asyncpg", None)
    with pytest.raises(DriverNotInstalledError) as exc:
        check_async_driver("postgresql+asyncpg://u:p@h/db")
    msg = str(exc.value)
    assert "asyncpg" in msg
    assert "vellaris[postgres]" in msg
    assert ":0.5.0-full" in msg
    assert "postgresql+asyncpg://u:p@h/db" in msg

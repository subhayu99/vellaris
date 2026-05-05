"""Alembic migrations apply cleanly against a fresh SQLite database."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def alembic_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    """Build an Alembic Config pointing at a fresh on-disk SQLite db."""
    monkeypatch.chdir(REPO_ROOT)
    db_path = tmp_path / "vellaris.db"
    monkeypatch.setenv("VELLARIS_DATABASE_URL", f"sqlite:///{db_path}")

    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    return cfg, db_path


def _expected_tables() -> set[str]:
    return {
        "users",
        "auth_challenges",
        "sessions",
        "documents",
        "document_access",
        "audit_log",
        "key_blobs",
        "webauthn_credentials",
        "webauthn_challenges",
        "push_subscriptions",
        "alembic_version",
    }


def test_upgrade_head_creates_all_tables(alembic_config: tuple[Any, Path]) -> None:
    cfg, db_path = alembic_config
    command.upgrade(cfg, "head")

    # Check tables exist via a sync engine.
    eng = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(eng)
    tables = set(inspector.get_table_names())
    eng.dispose()

    assert _expected_tables() <= tables


def test_downgrade_to_base_drops_all_tables(alembic_config: tuple[Any, Path]) -> None:
    cfg, db_path = alembic_config
    command.upgrade(cfg, "head")
    # Dispose any lingering engine cache from autogenerate (env.py builds one).
    sys.modules.pop("alembic.runtime.migration", None)
    command.downgrade(cfg, "base")

    eng = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(eng)
    tables = set(inspector.get_table_names())
    eng.dispose()

    # Only Alembic's own version table should remain.
    assert tables <= {"alembic_version"}

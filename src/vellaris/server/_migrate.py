"""Run Alembic migrations in-process from the running Python interpreter.

The CLI's ``vellaris-server migrate`` subcommand and the auto-migrate path
in ``vellaris-server`` both call :func:`upgrade_to_head`. Running in-process
(rather than shelling out to ``alembic``) lets us:

  - skip the alembic CLI install in the slim Docker image
  - emit structured logs through our own logger
  - share the configured DATABASE_URL via VellarisSettings

Alembic's API expects a sync engine; ``alembic/env.py`` already translates
``+asyncpg`` / ``+aiosqlite`` / ``+asyncmy`` URLs to their sync equivalents.
"""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config


def _alembic_config() -> Config:
    """Locate alembic.ini + the migration script tree.

    Order:
      1. Installed-wheel layout: vellaris/server/alembic.ini + vellaris/_alembic/
      2. Source-checkout layout: <repo>/alembic.ini + <repo>/alembic/
    """
    pkg_dir = Path(__file__).resolve().parent  # .../vellaris/server/
    in_pkg_ini = pkg_dir / "alembic.ini"
    if in_pkg_ini.is_file():
        cfg = Config(str(in_pkg_ini))
        cfg.set_main_option("script_location", str(pkg_dir.parent / "_alembic"))
        return cfg
    repo_ini = pkg_dir.parents[2] / "alembic.ini"
    if repo_ini.is_file():
        cfg = Config(str(repo_ini))
        cfg.set_main_option("script_location", str(repo_ini.parent / "alembic"))
        return cfg
    raise RuntimeError(f"alembic.ini not found near {pkg_dir} or {repo_ini}")


def upgrade_to_head() -> None:
    """Run ``alembic upgrade head`` in-process. Idempotent if already at head."""
    cfg = _alembic_config()
    command.upgrade(cfg, "head")

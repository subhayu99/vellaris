"""Alembic env.py — runs migrations against a sync engine derived from VellarisSettings."""

from __future__ import annotations

from logging.config import fileConfig
from typing import Any

import sqlalchemy as sa
from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# Importing models registers them with SQLModel.metadata so autogenerate sees the tables.
from vellaris.server import models  # noqa: F401
from vellaris.server.config import VellarisSettings
from vellaris.server.models import UtcDateTime

config = context.config

if config.config_file_name is not None:  # pragma: no cover - alembic CLI sets this
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def _render_item(item_type: str, obj: Any, autogen_context: Any) -> str | bool:
    """Translate Vellaris/SQLModel types into stdlib sqlalchemy ones for cleaner migrations.

    Without this, autogenerate emits ``vellaris.server.models.UtcDateTime`` and
    ``sqlmodel.sql.sqltypes.AutoString``, which require runtime imports inside
    every migration. Rendering them as ``sa.DateTime(timezone=True)`` and
    ``sa.String(length=N)`` keeps each migration file self-contained.
    """
    if item_type == "type":
        if isinstance(obj, UtcDateTime):
            return "sa.DateTime(timezone=True)"
        # sqlmodel.sql.sqltypes.AutoString — keep length hint.
        cls_path = f"{type(obj).__module__}.{type(obj).__name__}"
        if cls_path == "sqlmodel.sql.sqltypes.AutoString":
            length = getattr(obj, "length", None)
            return f"sa.String(length={length})" if length else "sa.String()"
    return False  # delegate to default rendering


# Silence "imported but unused" for sa — the alias is used inside f-strings via render_item.
_ = sa


def _sync_url() -> str:
    """Translate the configured DATABASE_URL into a sync driver URL for Alembic."""
    settings = VellarisSettings()
    url = settings.database_url
    # Strip async driver suffixes; Alembic uses sync drivers.
    return url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emits SQL without a live connection)."""
    context.configure(
        url=_sync_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_item=_render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (against a real DB connection)."""
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = _sync_url()

    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_item=_render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

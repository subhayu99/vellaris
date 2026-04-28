"""Tiny helper that builds a sync :class:`Client` from the on-disk config."""

from __future__ import annotations

import typer

from vellaris.client import Client
from vellaris.client.config import VellarisConfig


def load_config_or_exit() -> VellarisConfig:
    """Read ``~/.vellaris/config.toml`` or print a friendly error and exit."""
    cfg = VellarisConfig.load()
    if not cfg.server_url:
        typer.secho(
            "no server configured; run `vellaris signup --server URL` "
            "or `vellaris login --server URL`",
            err=True,
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=2)
    return cfg


def client_from_config(cfg: VellarisConfig | None = None) -> tuple[Client, VellarisConfig]:
    """Build a :class:`Client` configured from ``cfg`` (or the on-disk config)."""
    cfg = cfg or load_config_or_exit()
    if cfg.server_url is None:
        # load_config_or_exit catches this; this branch keeps the type checker happy.
        raise typer.Exit(code=2)
    client = Client(cfg.server_url, token=cfg.session_token)
    if cfg.current_user_id and cfg.current_username:
        # Pre-populate user context so commands that need it can read it.
        client._user = {"id": str(cfg.current_user_id), "username": cfg.current_username}
    return client, cfg


def require_session(cfg: VellarisConfig) -> None:
    """Bail with a friendly error if no token is cached."""
    if not cfg.has_active_session():
        typer.secho(
            "no active session; run `vellaris login`",
            err=True,
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=2)

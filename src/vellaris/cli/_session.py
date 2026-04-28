"""Tiny helper that builds a sync :class:`Client` from the on-disk config."""

from __future__ import annotations

import typer

from vellaris.client import Client
from vellaris.client.config import VellarisConfig
from vellaris.client.keystore import KeyStore
from vellaris.core.asymmetric import deserialize_private_key
from vellaris.core.errors import VellarisCryptoError
from vellaris.core.wrap import unwrap_private_key


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
        # cfg arrived from a caller that didn't go through load_config_or_exit
        # (e.g. `cfg = VellarisConfig.load()` followed by client_from_config(cfg)).
        # Re-emit the same friendly error rather than exiting silently.
        typer.secho(
            "no server configured; run `vellaris signup --server URL` "
            "or `vellaris login --server URL`",
            err=True,
            fg=typer.colors.RED,
        )
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


def load_private_key_or_exit(
    cfg: VellarisConfig, client: Client, *, prompt: str = "Passphrase"
) -> None:
    """Prompt for the passphrase, unwrap the local key blob, attach it to ``client``.

    Pull / share commands need the private key to decrypt or rewrap a DEK.
    Each CLI invocation is a fresh process, so we re-derive it from the
    wrapped blob via the user-provided passphrase.
    """
    if cfg.current_user_id is None:
        typer.secho(
            "no current user on file; run `vellaris login`",
            err=True,
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=2)

    keystore = KeyStore()
    if not keystore.has(cfg.current_user_id):
        typer.secho(
            f"no local key file for user {cfg.current_user_id}; run "
            f"`vellaris key import` or `vellaris key sync pull`",
            err=True,
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=2)

    passphrase = typer.prompt(prompt, hide_input=True)
    try:
        pem = unwrap_private_key(keystore.read_blob(cfg.current_user_id), passphrase)
    except VellarisCryptoError as exc:
        typer.secho(f"could not unwrap key: {exc}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None

    client._private_key = deserialize_private_key(pem)

"""CLI: key export / import / sync push / sync pull / sync delete."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated
from uuid import UUID

import typer

from vellaris.cli._session import client_from_config, require_session
from vellaris.client import VellarisAPIError
from vellaris.client.config import VellarisConfig

key_app = typer.Typer(name="key", help="Manage your wrapped private key.", no_args_is_help=True)
sync_app = typer.Typer(
    name="sync", help="Opt-in encrypted-blob sync to/from the server.", no_args_is_help=True
)
key_app.add_typer(sync_app)


@key_app.command("export")
def key_export(
    dest: Annotated[Path, typer.Argument(help="Where to write the wrapped key blob.")],
    user_id: Annotated[
        UUID | None,
        typer.Option("--user", help="Override the configured user."),
    ] = None,
) -> None:
    """Copy your wrapped key blob to a file (e.g. for offline backup)."""
    cfg = VellarisConfig.load()
    client, _ = client_from_config(cfg)
    try:
        path = client.export_key(dest, user_id=user_id)
    except FileNotFoundError as exc:
        typer.secho(f"export failed: {exc}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None
    typer.secho(f"✓ exported wrapped key to {path}", fg=typer.colors.GREEN)


@key_app.command("import")
def key_import(
    src: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
    user_id: Annotated[UUID, typer.Option("--user", help="User the key belongs to.")],
) -> None:
    """Import a wrapped key blob into the local key store."""
    cfg = VellarisConfig.load()
    client, _ = client_from_config(cfg)
    client.import_key(src, user_id)
    typer.secho(f"✓ imported wrapped key for {user_id}", fg=typer.colors.GREEN)


@sync_app.command("push")
def sync_push() -> None:
    """Upload your wrapped key blob to the server (opaque — server can't decrypt it)."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    try:
        client.push_keyblob()
    except VellarisAPIError as exc:
        typer.secho(f"sync push failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None
    typer.secho("✓ wrapped key blob pushed to server", fg=typer.colors.GREEN)


@sync_app.command("pull")
def sync_pull() -> None:
    """Pull your wrapped key blob from the server into the local key store."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    try:
        client.pull_keyblob()
    except VellarisAPIError as exc:
        typer.secho(f"sync pull failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None
    typer.secho("✓ wrapped key blob pulled from server", fg=typer.colors.GREEN)


@sync_app.command("delete")
def sync_delete() -> None:
    """Remove your wrapped key blob from the server."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    try:
        client.delete_remote_keyblob()
    except VellarisAPIError as exc:
        typer.secho(f"sync delete failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None
    typer.secho("✓ wrapped key blob removed from server", fg=typer.colors.GREEN)

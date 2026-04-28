"""CLI: push / pull / ls / rm."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated
from uuid import UUID

import typer

from vellaris.cli._session import (
    client_from_config,
    load_private_key_or_exit,
    require_session,
)
from vellaris.client import VellarisAPIError
from vellaris.client.config import VellarisConfig


def push(
    file_path: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
    share: Annotated[
        list[str] | None,
        typer.Option("--share", "-s", help="Username to share with. Repeat for multiple."),
    ] = None,
) -> None:
    """Encrypt and upload a file."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)

    typer.echo(f"Encrypting {file_path.name} on your device...")
    try:
        result = client.push(file_path, share_with=share)
    except VellarisAPIError as exc:
        typer.secho(f"push failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None

    typer.secho(f"✓ uploaded {file_path.name} as {result['id']}", fg=typer.colors.GREEN)
    if share:
        typer.echo(f"  shared with: {', '.join(share)}")


def pull(
    document_id: Annotated[UUID, typer.Argument()],
    out: Annotated[
        Path | None,
        typer.Option("--out", "-o", help="Output path. Defaults to the original filename in CWD."),
    ] = None,
) -> None:
    """Download and decrypt a document."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    load_private_key_or_exit(cfg, client)

    typer.echo(f"Decrypting {document_id} on your device...")
    try:
        decrypted = client.pull(document_id)
    except VellarisAPIError as exc:
        typer.secho(f"pull failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None

    target = out or Path.cwd() / decrypted.filename
    target.write_bytes(decrypted.plaintext)
    typer.secho(f"✓ wrote {target}", fg=typer.colors.GREEN)


def ls(
    scope: Annotated[
        str,
        typer.Option(help="One of: mine, shared, all."),
    ] = "all",
) -> None:
    """List documents available to the current user."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    try:
        docs = client.list_docs(scope=scope)
    except VellarisAPIError as exc:
        typer.secho(f"list failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None

    if not docs:
        typer.echo("no documents")
        return

    typer.echo(f"{'id':<38} {'size':>10}  owner")
    for doc in docs:
        typer.echo(f"{doc['id']:<38} {doc['ciphertext_size']:>10}  {doc['owner_id']}")


def rm(
    document_id: Annotated[UUID, typer.Argument()],
) -> None:
    """Delete a document. Owner only."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    try:
        client.delete_document(document_id)
    except VellarisAPIError as exc:
        typer.secho(f"delete failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None
    typer.secho(f"✓ deleted {document_id}", fg=typer.colors.GREEN)

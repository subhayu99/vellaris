"""CLI: share / revoke."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

import typer

from vellaris.cli._session import client_from_config, require_session
from vellaris.client import VellarisAPIError
from vellaris.client.config import VellarisConfig


def share(
    document_id: Annotated[UUID, typer.Argument()],
    username: Annotated[str, typer.Argument()],
) -> None:
    """Grant a user access to a document you own."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    try:
        client.share_document(document_id, username)
    except VellarisAPIError as exc:
        typer.secho(f"share failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None
    typer.secho(f"✓ shared {document_id} with {username}", fg=typer.colors.GREEN)


def revoke(
    document_id: Annotated[UUID, typer.Argument()],
    username: Annotated[str, typer.Argument()],
) -> None:
    """Remove a user's access to a document."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    try:
        client.revoke_document(document_id, username)
    except VellarisAPIError as exc:
        typer.secho(f"revoke failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None
    typer.secho(f"✓ revoked {username} from {document_id}", fg=typer.colors.GREEN)

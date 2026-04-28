"""CLI: signup / login / logout / whoami."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

import typer

from vellaris.cli._session import client_from_config, require_session
from vellaris.client import Client, VellarisAPIError
from vellaris.client.config import VellarisConfig


def signup(
    server: Annotated[str, typer.Option("--server", help="Server URL.")],
    username: Annotated[str, typer.Option(prompt=True)],
    email: Annotated[str, typer.Option(prompt=True)],
    passphrase: Annotated[
        str,
        typer.Option(
            prompt=True,
            confirmation_prompt=True,
            hide_input=True,
            help="Encrypts your private key locally. Cannot be recovered.",
        ),
    ],
) -> None:
    """Sign up a new user. Generates an RSA-4096 keypair on this machine."""
    typer.echo(f"Signing up {username} at {server}...")
    client = Client(server)
    try:
        user = client.signup(username=username, email=email, passphrase=passphrase)
    except VellarisAPIError as exc:
        typer.secho(f"signup failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None

    cfg = VellarisConfig.load()
    cfg.server_url = server
    cfg.current_user_id = UUID(user["id"])
    cfg.current_username = user["username"]
    cfg.clear_session()  # signup doesn't issue a session — log in next.
    cfg.save()

    typer.secho(
        f"✓ signed up as {user['username']} (id {user['id']})",
        fg=typer.colors.GREEN,
    )
    typer.echo(
        "Your wrapped private key is at ~/.vellaris/keys/. Run `vellaris login` to start a session."
    )


def login(
    server: Annotated[
        str | None, typer.Option("--server", help="Override the saved server URL.")
    ] = None,
    username: Annotated[str | None, typer.Option(help="Defaults to the most recent user.")] = None,
    passphrase: Annotated[str, typer.Option(prompt=True, hide_input=True)] = "",
) -> None:
    """Run the challenge-response flow and cache a session token."""
    cfg = VellarisConfig.load()
    if server:
        cfg.server_url = server
    if cfg.server_url is None:
        typer.secho(
            "no server URL on file; pass --server",
            err=True,
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=2)

    final_username = username or cfg.current_username
    if final_username is None:
        typer.secho(
            "no username on file; pass --username",
            err=True,
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=2)

    client = Client(cfg.server_url)
    try:
        user = client.login(final_username, passphrase)
    except VellarisAPIError as exc:
        typer.secho(f"login failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None
    except Exception as exc:
        typer.secho(f"login failed: {exc}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None

    cfg.current_user_id = UUID(user["id"])
    cfg.current_username = user["username"]
    cfg.session_token = client.token
    # The verify response carries an absolute expires_at, but Client doesn't expose
    # it directly through its sync surface; we conservatively assume the
    # default 8h TTL. This is just a UX hint — the server is the source of truth.
    cfg.session_expires_at = datetime.now(UTC) + timedelta(hours=8)
    cfg.save()

    typer.secho(f"✓ logged in as {user['username']}", fg=typer.colors.GREEN)


def logout() -> None:
    """Revoke the cached session token."""
    cfg = VellarisConfig.load()
    if not cfg.session_token:
        typer.echo("not logged in")
        return

    client, _ = client_from_config(cfg)
    try:
        client.logout()
    except VellarisAPIError as exc:
        # 401 means the token already expired — still clear local state.
        if exc.status_code != 401:
            typer.secho(
                f"server-side logout failed: {exc.detail}",
                err=True,
                fg=typer.colors.YELLOW,
            )

    cfg.clear_session()
    cfg.save()
    typer.secho("✓ logged out", fg=typer.colors.GREEN)


def whoami() -> None:
    """Print the currently signed-in user."""
    cfg = VellarisConfig.load()
    require_session(cfg)
    client, _ = client_from_config(cfg)
    try:
        user = client.whoami()
    except VellarisAPIError as exc:
        typer.secho(f"whoami failed: {exc.detail}", err=True, fg=typer.colors.RED)
        raise typer.Exit(code=1) from None

    typer.echo(f"username: {user['username']}")
    typer.echo(f"email:    {user['email']}")
    typer.echo(f"id:       {user['id']}")
    typer.echo(f"server:   {client.server_url}")

"""Top-level Typer app for the `vellaris` CLI."""

from __future__ import annotations

import typer

from vellaris import __version__
from vellaris.cli import auth as auth_cmds
from vellaris.cli import files as file_cmds
from vellaris.cli import share as share_cmds
from vellaris.cli.key import key_app

app = typer.Typer(
    name="vellaris",
    help="Files only the people you choose can read.",
    no_args_is_help=True,
    add_completion=False,
)


@app.callback()
def _root() -> None:
    """Vellaris — end-to-end encrypted document sharing you self-host."""


@app.command()
def version() -> None:
    """Print the installed Vellaris version."""
    typer.echo(__version__)


# auth
app.command()(auth_cmds.signup)
app.command()(auth_cmds.login)
app.command()(auth_cmds.logout)
app.command()(auth_cmds.whoami)

# files
app.command()(file_cmds.push)
app.command()(file_cmds.pull)
app.command()(file_cmds.ls)
app.command(name="rm")(file_cmds.rm)

# sharing
app.command()(share_cmds.share)
app.command()(share_cmds.revoke)

# key management
app.add_typer(key_app)


if __name__ == "__main__":  # pragma: no cover
    app()

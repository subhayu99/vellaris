"""Top-level Typer app for the `vellaris` CLI."""

from __future__ import annotations

import typer

from vellaris import __version__

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


if __name__ == "__main__":  # pragma: no cover
    app()

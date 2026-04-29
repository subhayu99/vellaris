"""CLI command surface tests via Typer's CliRunner.

Drives the actual CLI commands but mocks the SDK :class:`Client` so we
don't need a running server. The SDK integration test covers the
end-to-end path; this file just verifies the CLI plumbing — argument
parsing, output formatting, exit codes.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from typer.testing import CliRunner

from vellaris.cli.main import app
from vellaris.client.config import VellarisConfig

runner = CliRunner()


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_HOME", str(tmp_path / "vellaris"))


def test_root_help_shows_all_commands() -> None:
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    for cmd in [
        "signup",
        "login",
        "logout",
        "whoami",
        "push",
        "pull",
        "ls",
        "rm",
        "share",
        "revoke",
        "key",
    ]:
        assert cmd in result.output


def test_version_command() -> None:
    # Hardcoding the version here is a footgun: every release bump makes this
    # test fail, and a stale `pip install -e .` masks it locally. Compare
    # against the real package metadata instead.
    from vellaris import __version__

    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert result.output.strip() == __version__


def test_whoami_without_session_fails() -> None:
    result = runner.invoke(app, ["whoami"])
    assert result.exit_code == 2
    assert "no active session" in result.output


def test_logout_without_session_is_noop() -> None:
    """Hitting logout when never logged in should just say so without crashing."""
    cfg = VellarisConfig(server_url="https://example.com")
    cfg.save()
    result = runner.invoke(app, ["logout"])
    assert result.exit_code == 0
    assert "not logged in" in result.output


def test_signup_invokes_client_and_persists_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock Client so the CLI flow runs without needing a real server."""
    mock_client = MagicMock()
    mock_client.signup.return_value = {"id": str(uuid4()), "username": "alice"}

    with patch("vellaris.cli.auth.Client", return_value=mock_client):
        result = runner.invoke(
            app,
            ["signup", "--server", "https://example.com"],
            input="alice\nalice@example.com\npassphrase\npassphrase\n",
        )
    assert result.exit_code == 0, result.output
    mock_client.signup.assert_called_once_with(
        username="alice", email="alice@example.com", passphrase="passphrase"
    )

    cfg = VellarisConfig.load()
    assert cfg.server_url == "https://example.com"
    assert cfg.current_username == "alice"


def test_login_with_no_username_or_server_fails() -> None:
    result = runner.invoke(app, ["login"], input="passphrase\n")
    assert result.exit_code == 2


def test_key_help_shows_subcommands() -> None:
    result = runner.invoke(app, ["key", "--help"])
    assert result.exit_code == 0
    assert "export" in result.output
    assert "import" in result.output
    assert "sync" in result.output


def test_key_sync_help_shows_push_pull_delete() -> None:
    result = runner.invoke(app, ["key", "sync", "--help"])
    assert result.exit_code == 0
    assert "push" in result.output
    assert "pull" in result.output
    assert "delete" in result.output


def test_pull_without_session_fails() -> None:
    cfg = VellarisConfig(server_url="https://example.com")
    cfg.save()
    fake = "00000000-0000-0000-0000-000000000000"
    result = runner.invoke(app, ["pull", fake])
    assert result.exit_code == 2
    assert "no active session" in result.output


def test_push_with_missing_file_rejected(tmp_path: Path) -> None:
    """Typer's exists=True should reject a non-existent file early."""
    cfg = VellarisConfig(server_url="https://example.com")
    cfg.save()
    result = runner.invoke(app, ["push", str(tmp_path / "no-such-file")])
    assert result.exit_code != 0
    # Typer's error message is on stderr in newer versions; CliRunner merges streams.
    assert "no-such-file" in result.output or "does not exist" in result.output.lower()


def test_ls_without_session_fails() -> None:
    cfg = VellarisConfig(server_url="https://example.com")
    cfg.save()
    result = runner.invoke(app, ["ls"])
    assert result.exit_code == 2


def test_subprocess_smoke() -> None:
    """`python -m vellaris.cli.main --help` works without errors when imported as a script."""
    import subprocess

    result = subprocess.run(
        [sys.executable, "-m", "vellaris.cli.main", "--help"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    assert "vellaris" in result.stdout.lower()

"""VellarisConfig load/save + VELLARIS_HOME override + session helpers."""

from __future__ import annotations

import stat
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest

from vellaris.client.config import (
    CONFIG_FILENAME,
    VellarisConfig,
    config_path,
    home_dir,
)


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_HOME", str(tmp_path / "vellaris"))


def test_home_dir_respects_env() -> None:
    assert home_dir().name == "vellaris"


def test_config_path_under_home_dir() -> None:
    assert config_path().parent == home_dir()
    assert config_path().name == CONFIG_FILENAME


def test_load_returns_empty_when_missing() -> None:
    cfg = VellarisConfig.load()
    assert cfg.server_url is None
    assert cfg.current_user_id is None
    assert cfg.session_token is None


def test_save_then_load_round_trip() -> None:
    user_id = uuid4()
    expires = datetime.now(UTC) + timedelta(hours=8)
    original = VellarisConfig(
        server_url="https://vault.example.com",
        current_user_id=user_id,
        current_username="alice",
        session_token="opaque-abc",
        session_expires_at=expires,
    )
    original.save()

    loaded = VellarisConfig.load()
    assert loaded.server_url == "https://vault.example.com"
    assert loaded.current_user_id == user_id
    assert loaded.current_username == "alice"
    assert loaded.session_token == "opaque-abc"
    # ISO round-trip preserves timezone.
    assert loaded.session_expires_at == expires


def test_save_creates_home_dir() -> None:
    cfg = VellarisConfig(server_url="x")
    cfg.save()
    assert home_dir().is_dir()


def test_config_file_has_600_perms() -> None:
    VellarisConfig(server_url="x", session_token="secret").save()
    mode = config_path().stat().st_mode & 0o777
    assert mode == 0o600


def test_extras_round_trip() -> None:
    VellarisConfig(extras={"theme": "dark", "density": "compact"}).save()
    loaded = VellarisConfig.load()
    assert loaded.extras == {"theme": "dark", "density": "compact"}


def test_has_active_session_true_when_unexpired() -> None:
    cfg = VellarisConfig(
        session_token="t",
        session_expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    assert cfg.has_active_session() is True


def test_has_active_session_false_when_expired() -> None:
    cfg = VellarisConfig(
        session_token="t",
        session_expires_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    assert cfg.has_active_session() is False


def test_has_active_session_false_when_missing() -> None:
    assert VellarisConfig().has_active_session() is False


def test_has_active_session_handles_naive_datetime() -> None:
    """If a load somehow produced a naive datetime, treat it as UTC, not crash."""
    cfg = VellarisConfig(session_token="t")
    cfg.session_expires_at = datetime(2099, 1, 1)  # naive
    assert cfg.has_active_session() is True


def test_clear_session() -> None:
    cfg = VellarisConfig(
        server_url="https://x",
        current_username="alice",
        session_token="t",
        session_expires_at=datetime.now(UTC),
    )
    cfg.clear_session()
    assert cfg.session_token is None
    assert cfg.session_expires_at is None
    # Server URL + username are kept so re-login is one step.
    assert cfg.server_url == "https://x"
    assert cfg.current_username == "alice"


def test_save_atomic_no_intermediate_files() -> None:
    """After save, only the canonical file exists — no leftover .tmp."""
    VellarisConfig(server_url="x").save()
    files = sorted(p.name for p in home_dir().iterdir())
    assert files == [CONFIG_FILENAME]


def test_home_directory_perms_when_created() -> None:
    """Home dir should be 0o700-ish; at minimum, owner-only write."""
    VellarisConfig(server_url="x").save()
    mode = home_dir().stat().st_mode & 0o777
    # Must not allow group or world write.
    assert not (mode & stat.S_IWGRP)
    assert not (mode & stat.S_IWOTH)

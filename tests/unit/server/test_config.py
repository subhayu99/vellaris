"""Settings load defaults + override via VELLARIS_* env vars."""

from __future__ import annotations

import pytest

from vellaris.server.config import VellarisSettings, get_settings, reset_settings_cache


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    reset_settings_cache()


def test_defaults_are_dev_friendly(monkeypatch: pytest.MonkeyPatch) -> None:
    # Wipe any ambient VELLARIS_* env vars so the test sees defaults.
    for name in list(monkeypatch._setenv.keys() if hasattr(monkeypatch, "_setenv") else []):
        monkeypatch.delenv(name, raising=False)
    s = VellarisSettings(_env_file=None)  # type: ignore[call-arg]
    assert s.port == 8000
    assert s.blob_backend == "local"
    assert s.session_ttl_seconds == 8 * 60 * 60
    assert s.max_upload_bytes == 100 * 1024 * 1024


def test_env_overrides_take_effect(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_PORT", "9000")
    monkeypatch.setenv("VELLARIS_BLOB_BACKEND", "s3")
    monkeypatch.setenv("VELLARIS_S3_BUCKET", "my-bucket")
    monkeypatch.setenv("VELLARIS_MAX_UPLOAD_BYTES", "1048576")

    s = VellarisSettings(_env_file=None)  # type: ignore[call-arg]
    assert s.port == 9000
    assert s.blob_backend == "s3"
    assert s.s3_bucket == "my-bucket"
    assert s.max_upload_bytes == 1048576


def test_invalid_blob_backend_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_BLOB_BACKEND", "ftp")
    with pytest.raises(ValueError):
        VellarisSettings(_env_file=None)  # type: ignore[call-arg]


def test_get_settings_caches() -> None:
    a = get_settings()
    b = get_settings()
    assert a is b
    reset_settings_cache()
    c = get_settings()
    assert c is not a

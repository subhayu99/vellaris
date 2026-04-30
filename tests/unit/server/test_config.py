"""Settings — env-var parsing for the new storage URL model."""

from __future__ import annotations

import json

import pytest

from vellaris.server.config import VellarisSettings, reset_settings_cache


@pytest.fixture(autouse=True)
def _reset_cache() -> None:
    reset_settings_cache()
    yield
    reset_settings_cache()


def test_blob_url_defaults_to_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VELLARIS_BLOB_URL", raising=False)
    s = VellarisSettings()
    # Default is a relative file:// URL under ./var/blobs
    assert s.blob_url.startswith("file://")
    assert s.blob_url.endswith("var/blobs")


def test_blob_url_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_BLOB_URL", "s3://my-bucket/blobs")
    s = VellarisSettings()
    assert s.blob_url == "s3://my-bucket/blobs"


def test_blob_options_json_parses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "VELLARIS_BLOB_OPTIONS_JSON",
        json.dumps({"endpoint_url": "https://minio.example.com", "key": "abc"}),
    )
    s = VellarisSettings()
    assert s.blob_options == {"endpoint_url": "https://minio.example.com", "key": "abc"}


def test_blob_options_json_invalid_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_BLOB_OPTIONS_JSON", "{not-json")
    with pytest.raises(ValueError):
        VellarisSettings()


def test_auto_migrate_default_on() -> None:
    s = VellarisSettings()
    assert s.auto_migrate is True


def test_auto_migrate_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_AUTO_MIGRATE", "0")
    s = VellarisSettings()
    assert s.auto_migrate is False


def test_legacy_blob_vars_are_not_read(monkeypatch: pytest.MonkeyPatch) -> None:
    """Old vars from 0.4.x are silently ignored — clean cutover."""
    monkeypatch.setenv("VELLARIS_BLOB_BACKEND", "s3")
    monkeypatch.setenv("VELLARIS_BLOB_ROOT", "/tmp/wrong")
    monkeypatch.setenv("VELLARIS_S3_BUCKET", "wrong-bucket")
    s = VellarisSettings()
    # Defaults still apply — old vars don't bleed through
    assert s.blob_url.startswith("file://")
    assert "wrong" not in s.blob_url

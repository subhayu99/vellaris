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


def test_webauthn_rp_origins_accepts_csv(monkeypatch: pytest.MonkeyPatch) -> None:
    """Comma-separated string is the friendly Docker form."""
    monkeypatch.setenv(
        "VELLARIS_WEBAUTHN_RP_ORIGINS",
        "https://app.example.com,https://staging.example.com",
    )
    s = VellarisSettings()
    assert s.webauthn_rp_origins == [
        "https://app.example.com",
        "https://staging.example.com",
    ]


def test_webauthn_rp_origins_accepts_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """JSON list is also accepted — whichever the operator prefers."""
    monkeypatch.setenv(
        "VELLARIS_WEBAUTHN_RP_ORIGINS",
        '["https://a.example.com", "https://b.example.com"]',
    )
    s = VellarisSettings()
    assert s.webauthn_rp_origins == ["https://a.example.com", "https://b.example.com"]


def test_webauthn_rp_origins_csv_drops_empty_entries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_WEBAUTHN_RP_ORIGINS", "https://a.example.com, ,,")
    s = VellarisSettings()
    assert s.webauthn_rp_origins == ["https://a.example.com"]


def test_cors_allow_origins_accepts_csv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "VELLARIS_CORS_ALLOW_ORIGINS",
        "https://app.example.com,https://docs.example.com",
    )
    s = VellarisSettings()
    assert s.cors_allow_origins == [
        "https://app.example.com",
        "https://docs.example.com",
    ]

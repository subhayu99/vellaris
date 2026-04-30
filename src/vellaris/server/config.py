"""Server configuration via environment variables.

All settings are read from ``VELLARIS_*`` env vars (or a ``.env`` file
in the working directory). Defaults are friendly for local dev — change
them at deploy time.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class VellarisSettings(BaseSettings):
    """Top-level server configuration."""

    model_config = SettingsConfigDict(
        env_prefix="VELLARIS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- network ---
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000, ge=1, le=65535)
    cors_allow_origins: list[str] = Field(default_factory=lambda: ["*"])

    # --- database ---
    database_url: str = Field(default="sqlite+aiosqlite:///./vellaris.db")
    database_echo: bool = Field(default=False)
    auto_migrate: bool = Field(
        default=True,
        description="Run `alembic upgrade head` on startup. Disable in blue/green pipelines.",
    )

    # --- auth / sessions ---
    session_ttl_seconds: int = Field(default=8 * 60 * 60, ge=60)
    challenge_ttl_seconds: int = Field(default=5 * 60, ge=10)

    # --- blob storage ---
    blob_url: str = Field(
        default_factory=lambda: f"file://{(Path.cwd() / 'var' / 'blobs').as_posix()}",
        description="fsspec URL — e.g. file:///var/blobs, s3://bucket/prefix, gs://bucket, az://container",
    )
    blob_options_json: str | None = Field(
        default=None,
        description="JSON-encoded fsspec storage_options (endpoint_url, keys, etc.).",
    )

    # --- limits ---
    max_upload_bytes: int = Field(default=100 * 1024 * 1024, ge=1)
    rate_limit_per_minute: int = Field(default=120, ge=1)
    rate_limit_burst: int = Field(default=20, ge=1)

    # --- audit log ---
    audit_signing_key_path: Path | None = Field(default=None)

    @field_validator("blob_options_json")
    @classmethod
    def _validate_blob_options_json(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        try:
            parsed = json.loads(v)
        except json.JSONDecodeError as exc:
            raise ValueError(f"VELLARIS_BLOB_OPTIONS_JSON is not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ValueError("VELLARIS_BLOB_OPTIONS_JSON must decode to a JSON object")
        return v

    @property
    def blob_options(self) -> dict[str, object]:
        """Parsed storage_options dict, or empty if unset."""
        if not self.blob_options_json:
            return {}
        result: dict[str, object] = json.loads(self.blob_options_json)
        return result


@lru_cache(maxsize=1)
def get_settings() -> VellarisSettings:
    """Cached settings accessor. Suitable as a FastAPI dependency."""
    return VellarisSettings()


def reset_settings_cache() -> None:
    """Clear the settings cache. Tests use this when overriding env vars."""
    get_settings.cache_clear()

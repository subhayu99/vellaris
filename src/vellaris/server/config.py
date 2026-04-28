"""Server configuration via environment variables.

All settings are read from ``VELLARIS_*`` env vars (or a ``.env`` file
in the working directory). Defaults are friendly for local dev — change
them at deploy time.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BlobBackend = Literal["local", "s3"]


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
    host: str = Field(default="0.0.0.0", description="Uvicorn bind address.")
    port: int = Field(default=8000, ge=1, le=65535)
    cors_allow_origins: list[str] = Field(
        default_factory=lambda: ["*"],
        description="CORS allow-list. Tighten in production.",
    )

    # --- database ---
    database_url: str = Field(
        default="sqlite+aiosqlite:///./vellaris.db",
        description="SQLAlchemy URL. Use postgresql+psycopg://... in prod.",
    )
    database_echo: bool = Field(default=False, description="Log SQL statements (dev only).")

    # --- auth / sessions ---
    session_ttl_seconds: int = Field(default=8 * 60 * 60, ge=60)
    challenge_ttl_seconds: int = Field(default=5 * 60, ge=10)

    # --- blob storage ---
    blob_backend: BlobBackend = Field(default="local")
    blob_root: Path = Field(default=Path("./var/blobs"))
    s3_bucket: str | None = None
    s3_region: str | None = None
    s3_endpoint_url: str | None = None  # for MinIO / localstack
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None

    # --- limits ---
    max_upload_bytes: int = Field(default=100 * 1024 * 1024, ge=1)  # 100 MiB
    rate_limit_per_minute: int = Field(default=120, ge=1)
    rate_limit_burst: int = Field(default=20, ge=1)

    # --- audit log ---
    audit_signing_key_path: Path | None = Field(
        default=None,
        description=(
            "Path to a 32-byte raw Ed25519 private-key file. If unset, "
            "a fresh key is generated in memory at startup (dev only)."
        ),
    )


@lru_cache(maxsize=1)
def get_settings() -> VellarisSettings:
    """Cached settings accessor. Suitable as a FastAPI dependency."""
    return VellarisSettings()


def reset_settings_cache() -> None:
    """Clear the settings cache. Tests use this when overriding env vars."""
    get_settings.cache_clear()

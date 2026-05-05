"""Server configuration via environment variables.

All settings are read from ``VELLARIS_*`` env vars (or a ``.env`` file
in the working directory). Defaults are friendly for local dev — change
them at deploy time.
"""

from __future__ import annotations

import json
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


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
    # NoDecode keeps pydantic-settings from JSON-parsing the env var
    # before our validator sees it; we want to accept comma-separated
    # strings as well as JSON lists.
    cors_allow_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["*"], description="CORS allow-list. Tighten in production."
    )

    # --- database ---
    database_url: str = Field(
        default="sqlite+aiosqlite:///./vellaris.db",
        description="SQLAlchemy URL — pick postgresql+asyncpg://, mysql+asyncmy://, or sqlite+aiosqlite://",
    )
    database_echo: bool = Field(default=False, description="Log SQL statements (dev only).")
    auto_migrate: bool = Field(
        default=True,
        description="Run `alembic upgrade head` on startup. Disable in blue/green pipelines.",
    )

    # --- auth / sessions ---
    session_ttl_seconds: int = Field(default=8 * 60 * 60, ge=60)
    challenge_ttl_seconds: int = Field(default=5 * 60, ge=10)

    # --- WebAuthn / passkeys ---
    # The Relying Party (RP) ID is the registrable domain WebAuthn binds
    # credentials to. Browsers refuse to use a passkey on a different RP
    # ID than the one it was registered under. For local dev keep it as
    # "localhost"; production should be "vellaris.example.com" (or the
    # apex if you want subdomains to share the same passkey).
    webauthn_rp_id: str = Field(
        default="localhost",
        description="WebAuthn Relying Party ID (registrable domain).",
    )
    webauthn_rp_name: str = Field(
        default="Vellaris",
        description="Human-readable name shown in the platform passkey prompt.",
    )
    # Allowed origins for both register and authenticate ceremonies. The
    # browser sends the page origin in clientDataJSON; verification fails
    # if it isn't in this list. Include https variants and the dev port.
    #
    # Accepts comma-separated strings as well as JSON lists, so Docker
    # operators can write
    # ``VELLARIS_WEBAUTHN_RP_ORIGINS=https://app.example.com,https://staging.example.com``
    # without escaping JSON brackets in their compose files. NoDecode
    # bypasses pydantic-settings' default JSON parsing so the validator
    # below can sniff which form the operator used.
    webauthn_rp_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:8000"],
        description=(
            "Allowed origins for WebAuthn ceremonies. Comma-separated "
            "or JSON list (e.g. https://app.example.com)."
        ),
    )

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
    audit_signing_key_path: Path | None = Field(
        default=None,
        description=(
            "Path to a 32-byte raw Ed25519 private-key file. If unset, "
            "a fresh key is generated in memory at startup (dev only)."
        ),
    )

    # --- push notifications (Web Push / VAPID) ---
    vapid_private_key_path: Path | None = Field(
        default=None,
        description=(
            "Path to a 32-byte raw P-256 private key for VAPID. Generate "
            "via `vellaris-server generate-vapid-key > vapid.key`. If unset, "
            "the /notifications/* endpoints return 503 (push notifications "
            "disabled — fine for single-user / dev installs)."
        ),
    )
    vapid_subject: str = Field(
        default="mailto:noreply@example.com",
        description=(
            "VAPID subject claim (RFC 8292 §2). Push services use this to "
            "contact the operator if the keys misbehave. Use a real "
            "mailto: or https:// URI in production."
        ),
    )

    @field_validator("webauthn_rp_origins", "cors_allow_origins", mode="before")
    @classmethod
    def _split_origins_csv(cls, v: object) -> object:
        """Accept either a JSON list or a comma-separated string.

        Pydantic's default env-var parsing for ``list[str]`` expects a
        JSON-encoded list (``'["https://a","https://b"]'``), which is
        awkward to escape in shell + Docker. We accept the friendlier
        ``"https://a,https://b"`` form too — empty entries are dropped.
        Both fields opt out of pydantic-settings' default JSON-decoding
        via the ``NoDecode`` annotation so this validator sees the raw
        env-var string.
        """
        if isinstance(v, str):
            stripped = v.strip()
            if stripped.startswith("["):
                # Caller supplied a JSON list — parse it here since
                # NoDecode disabled pydantic-settings' built-in step.
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"origins is not valid JSON: {exc}") from exc
                if not isinstance(parsed, list):
                    raise ValueError("origins JSON must decode to a list")
                return parsed
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return v

    @field_validator("blob_options_json")
    @classmethod
    def _validate_blob_options_json(cls, v: str | None) -> str | None:
        if not v or not v.strip():
            return None
        try:
            parsed = json.loads(v)
        except json.JSONDecodeError as exc:
            raise ValueError(f"VELLARIS_BLOB_OPTIONS_JSON is not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ValueError("VELLARIS_BLOB_OPTIONS_JSON must decode to a JSON object")
        return v

    @cached_property
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

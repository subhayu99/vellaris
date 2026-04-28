"""Local user configuration: ``~/.vellaris/config.toml``.

Stores the configured server URL, the currently signed-in user, and the
opaque session token + its expiry. The token is sensitive (hijacking it
gets full account access until expiry), so the config file is written
with mode 0o600.

Override the home directory with the ``VELLARIS_HOME`` env var; this is
what tests use to keep state isolated from the developer's real
``~/.vellaris/``.
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import tomli_w

DEFAULT_HOME_DIRNAME = ".vellaris"
CONFIG_FILENAME = "config.toml"


def home_dir() -> Path:
    """Resolve ``~/.vellaris/`` honouring the ``VELLARIS_HOME`` env override."""
    override = os.environ.get("VELLARIS_HOME")
    if override:
        return Path(override).expanduser()
    return Path.home() / DEFAULT_HOME_DIRNAME


def config_path() -> Path:
    return home_dir() / CONFIG_FILENAME


@dataclass
class VellarisConfig:
    """Persistent client configuration."""

    server_url: str | None = None
    current_user_id: UUID | None = None
    current_username: str | None = None
    session_token: str | None = None
    session_expires_at: datetime | None = None
    # Reserved for future use (e.g. encrypt-anim preference, density).
    extras: dict[str, str] = field(default_factory=dict)

    # ---------- IO ----------

    @classmethod
    def load(cls, path: Path | None = None) -> VellarisConfig:
        """Load from ``path`` (default: :func:`config_path`). Returns an empty config if the file is missing."""
        target = path or config_path()
        if not target.exists():
            return cls()

        with open(target, "rb") as f:
            data = tomllib.load(f)

        return cls(
            server_url=data.get("server_url"),
            current_user_id=UUID(data["current_user_id"]) if data.get("current_user_id") else None,
            current_username=data.get("current_username"),
            session_token=data.get("session_token"),
            session_expires_at=(
                datetime.fromisoformat(data["session_expires_at"])
                if data.get("session_expires_at")
                else None
            ),
            extras=data.get("extras", {}),
        )

    def save(self, path: Path | None = None) -> None:
        """Persist to ``path``. Creates ``~/.vellaris/`` if needed; chmods config to 0o600."""
        target = path or config_path()
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)

        payload: dict[str, object] = {}
        if self.server_url is not None:
            payload["server_url"] = self.server_url
        if self.current_user_id is not None:
            payload["current_user_id"] = str(self.current_user_id)
        if self.current_username is not None:
            payload["current_username"] = self.current_username
        if self.session_token is not None:
            payload["session_token"] = self.session_token
        if self.session_expires_at is not None:
            payload["session_expires_at"] = self.session_expires_at.isoformat()
        if self.extras:
            payload["extras"] = self.extras

        # Atomic-rename write so concurrent reads never see a half-file.
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(tomli_w.dumps(payload).encode("utf-8"))
        os.chmod(tmp, 0o600)
        os.replace(tmp, target)

    # ---------- session helpers ----------

    def has_active_session(self) -> bool:
        """True iff a session token is present and not yet expired."""
        if self.session_token is None or self.session_expires_at is None:
            return False
        # Compare as UTC-aware to avoid naive/aware mismatches.
        expires = self.session_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        return expires > datetime.now(UTC)

    def clear_session(self) -> None:
        """Drop the cached session token but keep the user identity + server URL."""
        self.session_token = None
        self.session_expires_at = None

    # ---------- introspection ----------

    def to_dict(self) -> dict[str, object]:
        return asdict(self)

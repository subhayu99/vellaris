"""SQLModel tables for the Vellaris server.

The server stores ciphertext, encrypted DEKs, and metadata only; nothing
here lets the server decrypt user data on its own. See the plan's
"Data model (clean)" section for the rationale behind every column.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, DateTime, LargeBinary, TypeDecorator
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    """Timezone-aware UTC now."""
    return datetime.now(UTC)


class UtcDateTime(TypeDecorator[datetime]):
    """A TIMESTAMPTZ-style column that always reads back UTC-aware datetimes.

    SQLite (used in tests) stores datetimes without timezone info and
    returns naive values; this decorator coerces them back to UTC on
    load so app-level comparisons against ``datetime.now(UTC)`` don't
    blow up with naive/aware mismatches. Postgres TIMESTAMPTZ already
    returns aware values, but the decorator is harmless there too.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class User(SQLModel, table=True):
    """A registered user. Holds the public key only — no passwords, no private keys."""

    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    username: str = Field(index=True, unique=True, min_length=1, max_length=64)
    email: str = Field(index=True, unique=True, max_length=320)
    public_key: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(UtcDateTime(), nullable=False),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(UtcDateTime(), nullable=True),
    )


class AuthChallenge(SQLModel, table=True):
    """A transient nonce a client signs to prove possession of their private key."""

    __tablename__ = "auth_challenges"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    nonce: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    expires_at: datetime = Field(sa_column=Column(UtcDateTime(), nullable=False, index=True))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(UtcDateTime(), nullable=False),
    )


class Session(SQLModel, table=True):
    """An authenticated session — the opaque token replaces JWTs."""

    __tablename__ = "sessions"

    token: str = Field(primary_key=True, max_length=64)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    expires_at: datetime = Field(sa_column=Column(UtcDateTime(), nullable=False, index=True))
    last_used_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(UtcDateTime(), nullable=False),
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(UtcDateTime(), nullable=False),
    )
    ip_hash: str | None = Field(default=None, max_length=64)
    user_agent_hash: str | None = Field(default=None, max_length=64)


class Document(SQLModel, table=True):
    """An encrypted document. The server never sees plaintext or filename."""

    __tablename__ = "documents"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    owner_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    ciphertext_size: int = Field(nullable=False, ge=0)
    encrypted_filename: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    content_hash: str = Field(nullable=False, max_length=128, index=True)
    blob_key: str = Field(nullable=False, max_length=256, unique=True)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(UtcDateTime(), nullable=False),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(UtcDateTime(), nullable=True),
    )


class DocumentAccess(SQLModel, table=True):
    """Per-recipient encrypted-DEK row. Replaces the SharedKeyRegistry concept."""

    __tablename__ = "document_access"

    document_id: UUID = Field(foreign_key="documents.id", primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    encrypted_dek: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    granted_by: UUID = Field(foreign_key="users.id", nullable=False)
    granted_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(UtcDateTime(), nullable=False),
    )


class AuditAction(StrEnum):
    """Closed set of state-changing actions worth recording."""

    USER_SIGNUP = "user.signup"
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    DOCUMENT_UPLOAD = "document.upload"
    DOCUMENT_DOWNLOAD = "document.download"
    DOCUMENT_DELETE = "document.delete"
    DOCUMENT_SHARE = "document.share"
    DOCUMENT_REVOKE = "document.revoke"
    KEYBLOB_PUSH = "keyblob.push"
    KEYBLOB_PULL = "keyblob.pull"
    KEYBLOB_DELETE = "keyblob.delete"


class AuditLog(SQLModel, table=True):
    """Append-only signed log entry. Server signs every entry on write."""

    __tablename__ = "audit_log"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID | None = Field(default=None, foreign_key="users.id", index=True)
    action: AuditAction = Field(index=True, nullable=False)
    target_id: UUID | None = Field(default=None, index=True)
    extra: dict[str, str | int | bool | None] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    signature: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(UtcDateTime(), nullable=False, index=True),
    )


class KeyBlob(SQLModel, table=True):
    """Opt-in opaque wrapped-private-key blob. Server cannot decrypt it."""

    __tablename__ = "key_blobs"

    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    wrapped_key: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(UtcDateTime(), nullable=False),
    )


__all__ = [
    "AuditAction",
    "AuditLog",
    "AuthChallenge",
    "Document",
    "DocumentAccess",
    "KeyBlob",
    "Session",
    "User",
]

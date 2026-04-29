"""Pydantic schemas for request and response bodies.

Kept separate from :mod:`vellaris.server.models` (the SQLModel ORM
tables) so we can shape the API surface independently from the DB
schema — they happen to overlap a lot today but won't always.
"""

from __future__ import annotations

import base64
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, PlainSerializer


def _decode_b64(value: Any) -> bytes:
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, str):
        return base64.b64decode(value, validate=True)
    raise TypeError(f"expected bytes or base64 str, got {type(value).__name__}")


def _encode_b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


# A bytes field that's flexible on input (raw bytes OR base64 str) and
# always serializes as a base64 string in JSON.
B64Bytes = Annotated[
    bytes,
    BeforeValidator(_decode_b64),
    PlainSerializer(_encode_b64, return_type=str),
]


class UserCreate(BaseModel):
    """Signup body. ``public_key`` is the PEM-encoded RSA-4096 SPKI as bytes."""

    model_config = ConfigDict(json_schema_extra={"example": {"username": "alice"}})

    username: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    email: EmailStr
    public_key: B64Bytes = Field(description="PEM-encoded RSA public key (base64 over the wire).")


class UserPrivate(BaseModel):
    """Self-view: includes email."""

    id: UUID
    username: str
    email: EmailStr
    public_key: B64Bytes
    created_at: datetime


class UserPublic(BaseModel):
    """Other-user view: no email."""

    id: UUID
    username: str
    public_key: B64Bytes


class ChallengeRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)


class ChallengeResponse(BaseModel):
    challenge_id: UUID
    nonce: B64Bytes = Field(description="Random bytes the client signs.")
    expires_at: datetime


class VerifyRequest(BaseModel):
    challenge_id: UUID
    signature: B64Bytes = Field(description="RSA-PSS signature over challenge_id || nonce.")


class TokenResponse(BaseModel):
    token: str
    expires_at: datetime
    user: UserPrivate


# ---------- documents ----------


class AccessGrant(BaseModel):
    """A single recipient + the DEK encrypted for their public key."""

    user_id: UUID
    encrypted_dek: B64Bytes


class DocumentCreate(BaseModel):
    encrypted_filename: B64Bytes
    content_hash: str = Field(min_length=1, max_length=128)
    ciphertext: B64Bytes
    access: list[AccessGrant] = Field(min_length=1)


class DocumentSummary(BaseModel):
    """Listed in /documents — no ciphertext or per-user DEK."""

    id: UUID
    owner_id: UUID
    ciphertext_size: int
    content_hash: str
    encrypted_filename: B64Bytes
    created_at: datetime


class GrantSummary(BaseModel):
    """A single recipient on a document, owner-visible.

    Returned only to the owner so non-owners can't enumerate co-recipients.
    Includes ``username`` so the SPA doesn't have to round-trip /users/by-id
    for every chip.
    """

    user_id: UUID
    username: str


class DocumentDownload(BaseModel):
    """Returned by GET /documents/{id} for an authorized user."""

    id: UUID
    owner_id: UUID
    encrypted_filename: B64Bytes
    encrypted_dek: B64Bytes
    ciphertext: B64Bytes
    content_hash: str
    access: list[GrantSummary] | None = None


class ShareRequest(BaseModel):
    user_id: UUID
    encrypted_dek: B64Bytes


# ---------- key blob sync (opt-in) ----------


class KeyBlobUpload(BaseModel):
    wrapped_key: B64Bytes


class KeyBlobResponse(BaseModel):
    user_id: UUID
    wrapped_key: B64Bytes
    updated_at: datetime

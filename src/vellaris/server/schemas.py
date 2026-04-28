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

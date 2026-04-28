"""Challenge-response auth: client signs a server-issued nonce with their private key."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.core.asymmetric import deserialize_public_key, pss_verify
from vellaris.core.errors import KeyFormatError, SignatureError
from vellaris.server.config import VellarisSettings, get_settings
from vellaris.server.db import get_session as get_db_session
from vellaris.server.models import AuthChallenge, User
from vellaris.server.schemas import (
    ChallengeRequest,
    ChallengeResponse,
    TokenResponse,
    UserPrivate,
    VerifyRequest,
)
from vellaris.server.security import CurrentUser
from vellaris.server.sessions import create_session, revoke_session

router = APIRouter(prefix="/auth", tags=["auth"])

NONCE_NBYTES = 32  # 256 bits is plenty; the per-challenge TTL bounds replay anyway


def _signed_blob(challenge_id: UUID, nonce: bytes) -> bytes:
    """Bytes the client must sign. Re-derived deterministically on both sides."""
    return challenge_id.bytes + nonce


@router.post("/challenge", status_code=status.HTTP_201_CREATED, response_model=ChallengeResponse)
async def issue_challenge(
    body: ChallengeRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[VellarisSettings, Depends(get_settings)],
) -> ChallengeResponse:
    """Server issues a fresh nonce + challenge_id for the named user."""
    user = (await db.exec(select(User).where(User.username == body.username))).one_or_none()
    if user is None or user.deleted_at is not None:
        # Avoid disclosing whether the username exists; reuse the same error shape.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    nonce = os.urandom(NONCE_NBYTES)
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.challenge_ttl_seconds)
    challenge = AuthChallenge(user_id=user.id, nonce=nonce, expires_at=expires_at)
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)

    return ChallengeResponse(
        challenge_id=challenge.id, nonce=challenge.nonce, expires_at=challenge.expires_at
    )


@router.post("/verify", response_model=TokenResponse)
async def verify_challenge(
    body: VerifyRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[VellarisSettings, Depends(get_settings)],
    user_agent: Annotated[str | None, Header(alias="User-Agent")] = None,
) -> TokenResponse:
    """Client posts a signature over the challenge bytes; server issues a session token."""
    challenge = (
        await db.exec(select(AuthChallenge).where(AuthChallenge.id == body.challenge_id))
    ).one_or_none()
    if challenge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="challenge not found")

    if challenge.expires_at <= datetime.now(UTC):
        await db.delete(challenge)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="challenge expired")

    user = (await db.exec(select(User).where(User.id == challenge.user_id))).one_or_none()
    if user is None or user.deleted_at is not None:
        await db.delete(challenge)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    try:
        public_key = deserialize_public_key(user.public_key)
        pss_verify(_signed_blob(challenge.id, challenge.nonce), body.signature, public_key)
    except (KeyFormatError, SignatureError) as exc:
        # The challenge is single-use even on failure: deleting forces the client
        # to request a fresh nonce, defeating brute-force-against-one-nonce attacks.
        await db.delete(challenge)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="signature verification failed"
        ) from exc

    # Single-use: drop the challenge once it's verified.
    await db.delete(challenge)
    user_agent_hash = _short_hash(user_agent) if user_agent else None
    session = await create_session(db, user, settings=settings, user_agent_hash=user_agent_hash)
    await db.commit()
    await db.refresh(session)
    await db.refresh(user)

    return TokenResponse(
        token=session.token,
        expires_at=session.expires_at,
        user=UserPrivate.model_validate(user, from_attributes=True),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Revoke the current session token."""
    _ = current  # caller is authenticated; we only need the token
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(maxsplit=1)[1].strip()
        await revoke_session(db, token)
        await db.commit()


def _short_hash(value: str) -> str:
    """Truncated SHA-256 for logging non-PII identifiers (UA, IP)."""
    import hashlib

    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()[:32]

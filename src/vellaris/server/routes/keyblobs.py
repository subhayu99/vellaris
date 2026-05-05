"""Opt-in opaque wrapped-private-key sync.

The server stores the bytes verbatim. It cannot decrypt them — they're
already encrypted with a key derived from the user's passphrase via
Argon2id. This is purely a backup-and-restore convenience for users
who want their wrapped key available on multiple devices without
emailing it around.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.server.audit import record as audit_record
from vellaris.server.db import get_session as get_db_session
from vellaris.server.models import AuditAction, KeyBlob, User
from vellaris.server.schemas import KeyBlobResponse, KeyBlobUpload
from vellaris.server.security import CurrentUser

router = APIRouter(prefix="/key-blobs", tags=["key-blobs"])


@router.put("/me", response_model=KeyBlobResponse)
async def push(
    body: KeyBlobUpload,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> KeyBlob:
    """Upsert the caller's wrapped-key blob."""
    existing = (await db.exec(select(KeyBlob).where(KeyBlob.user_id == current.id))).one_or_none()
    if existing is not None:
        existing.wrapped_key = body.wrapped_key
        existing.updated_at = datetime.now(UTC)
        db.add(existing)
        result = existing
    else:
        result = KeyBlob(user_id=current.id, wrapped_key=body.wrapped_key)
        db.add(result)
    await audit_record(
        db,
        AuditAction.KEYBLOB_PUSH,
        user_id=current.id,
        extra={"size": len(body.wrapped_key)},
    )
    await db.commit()
    await db.refresh(result)
    return result


@router.get("/me", response_model=KeyBlobResponse)
async def pull(
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> KeyBlob:
    """Return the caller's stored wrapped-key blob, or 404 if none."""
    blob = (await db.exec(select(KeyBlob).where(KeyBlob.user_id == current.id))).one_or_none()
    if blob is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no key blob stored")
    await audit_record(db, AuditAction.KEYBLOB_PULL, user_id=current.id)
    await db.commit()
    return blob


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Remove the caller's wrapped-key blob."""
    blob = (await db.exec(select(KeyBlob).where(KeyBlob.user_id == current.id))).one_or_none()
    if blob is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no key blob stored")
    await db.delete(blob)
    await audit_record(db, AuditAction.KEYBLOB_DELETE, user_id=current.id)
    await db.commit()


@router.get("/by-username/{username}", response_model=KeyBlobResponse)
async def pull_by_username(
    username: str,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> KeyBlob:
    """Fetch the wrapped-key blob for ``username`` — public, unauthenticated.

    Used by the SPA's "sign in on a fresh device" flow: the user types
    their username + passphrase, the SPA pulls the (opaque) blob via this
    endpoint, unwraps locally with the passphrase, then runs the normal
    challenge-response login. Without this endpoint a user with no synced
    passkey + no local wrapped key has no way to recover their account on
    a new device.

    Security:

    * The blob is opaque ciphertext — Argon2id (256 MB · 3 passes · 4
      lanes) wraps the AES key. Leaking the blob to anyone who guesses
      the username gives them an offline target equivalent to a
      passphrase hash; the Argon2id cost is what bounds the brute force.
    * Returns 404 in BOTH "user not found" and "user found but no blob"
      cases — no information leak about which usernames exist beyond
      what ``GET /users/by-username/{username}`` already discloses.
    * The global per-IP rate limiter applies (see ``server.limits``); a
      determined attacker can still try, just slowly.
    * No audit-log entry is written. Audit log records *actions* tied to
      a session; an unauthenticated read of opaque ciphertext from a
      possibly-misspelled username would be log spam at best and an
      enumeration oracle at worst.
    """
    # Same "look up then check deleted_at" pattern as auth.py — keeps the
    # 404 message identical regardless of which case triggers it.
    user = (await db.exec(select(User).where(User.username == username))).one_or_none()
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no key blob stored")
    blob = (await db.exec(select(KeyBlob).where(KeyBlob.user_id == user.id))).one_or_none()
    if blob is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no key blob stored")
    return blob

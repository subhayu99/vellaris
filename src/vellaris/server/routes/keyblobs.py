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
from vellaris.server.models import AuditAction, KeyBlob
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

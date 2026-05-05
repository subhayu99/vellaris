"""Document upload / download / share / revoke / list / delete.

The server only ever sees ciphertext, encrypted filenames, and per-recipient
encrypted DEKs — never the plaintext or the raw DEK.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.server.audit import record as audit_record
from vellaris.server.db import get_session as get_db_session
from vellaris.server.models import (
    AuditAction,
    Document,
    DocumentAccess,
    User,
)
from vellaris.server.push import send_push
from vellaris.server.schemas import (
    DocumentCreate,
    DocumentDownload,
    DocumentSummary,
    GrantSummary,
    ShareRequest,
)
from vellaris.server.security import CurrentUser
from vellaris.server.storage import BlobNotFound, BlobStore
from vellaris.server.storage_factory import get_blob_store

router = APIRouter(prefix="/documents", tags=["documents"])


def _store() -> BlobStore:
    """Resolve the BlobStore (separate from the FastAPI dependency injection)."""
    return get_blob_store()


def _blob_key_for(doc_id: UUID) -> str:
    return f"documents/{doc_id}"


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DocumentSummary)
async def upload(
    body: DocumentCreate,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Document:
    """Store ciphertext + per-recipient encrypted DEK rows."""
    # Owner must always be in the access list (they need to be able to download).
    if not any(grant.user_id == current.id for grant in body.access):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="owner must appear in access list",
        )

    # All recipients must be real, non-deleted users.
    user_ids = {grant.user_id for grant in body.access}
    rows = (await db.exec(select(User).where(User.id.in_(user_ids)))).all()  # type: ignore[attr-defined]
    found = {u.id for u in rows if u.deleted_at is None}
    missing = user_ids - found
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown recipient(s): {sorted(map(str, missing))}",
        )

    doc = Document(
        owner_id=current.id,
        ciphertext_size=len(body.ciphertext),
        encrypted_filename=body.encrypted_filename,
        content_hash=body.content_hash,
        blob_key="",  # placeholder; set after we know the doc id
    )
    db.add(doc)
    await db.flush()
    doc.blob_key = _blob_key_for(doc.id)

    # Write the blob outside the SQL transaction (file IO is sync).
    await asyncio.to_thread(_store().put, doc.blob_key, bytes(body.ciphertext))

    db.add_all(
        [
            DocumentAccess(
                document_id=doc.id,
                user_id=grant.user_id,
                encrypted_dek=grant.encrypted_dek,
                granted_by=current.id,
            )
            for grant in body.access
        ]
    )
    await audit_record(
        db,
        AuditAction.DOCUMENT_UPLOAD,
        user_id=current.id,
        target_id=doc.id,
        extra={"recipients": len(body.access), "size": len(body.ciphertext)},
    )
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("", response_model=list[DocumentSummary])
async def list_documents(
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    scope: str = "all",
) -> list[Document]:
    """List documents the current user can decrypt.

    ``scope``: ``mine`` = owned by me, ``shared`` = shared with me (and not mine),
    ``all`` (default) = both.
    """
    if scope not in {"mine", "shared", "all"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scope must be one of: mine, shared, all",
        )

    if scope == "mine":
        stmt = select(Document).where(
            Document.owner_id == current.id,
            Document.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    else:
        # User must have a DocumentAccess row to see the doc.
        stmt = (
            select(Document)
            .join(DocumentAccess, Document.id == DocumentAccess.document_id)  # type: ignore[arg-type]
            .where(
                DocumentAccess.user_id == current.id,
                Document.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        if scope == "shared":
            stmt = stmt.where(Document.owner_id != current.id)

    docs = (await db.exec(stmt.order_by(Document.created_at.desc()))).all()  # type: ignore[attr-defined]
    # Deduplicate (a doc shared with self appears once via owner-side and once via access-side).
    by_id: dict[UUID, Document] = {}
    for d in docs:
        by_id.setdefault(d.id, d)
    return list(by_id.values())


@router.get("/{document_id}", response_model=DocumentDownload)
async def download(
    document_id: UUID,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> DocumentDownload:
    """Return the ciphertext + the requesting user's encrypted_dek."""
    doc = (
        await db.exec(
            select(Document).where(Document.id == document_id, Document.deleted_at.is_(None))  # type: ignore[union-attr]
        )
    ).one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    access = (
        await db.exec(
            select(DocumentAccess).where(
                DocumentAccess.document_id == doc.id,
                DocumentAccess.user_id == current.id,
            )
        )
    ).one_or_none()
    if access is None:
        # Don't disclose existence — return 404 even though the row exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    try:
        ciphertext = await asyncio.to_thread(_store().get, doc.blob_key)
    except BlobNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="blob missing for document (server-side data corruption)",
        ) from exc

    # Owner gets the full grant list so they can see who has access; for
    # non-owners we leave it None to avoid leaking co-recipient identities.
    grants: list[GrantSummary] | None = None
    if doc.owner_id == current.id:
        rows = (
            await db.exec(
                select(DocumentAccess, User)
                .join(User, DocumentAccess.user_id == User.id)  # type: ignore[arg-type]
                .where(DocumentAccess.document_id == doc.id)
            )
        ).all()
        grants = [
            GrantSummary(user_id=user.id, username=user.username) for _access_row, user in rows
        ]

    await audit_record(db, AuditAction.DOCUMENT_DOWNLOAD, user_id=current.id, target_id=doc.id)
    await db.commit()

    return DocumentDownload(
        id=doc.id,
        owner_id=doc.owner_id,
        encrypted_filename=doc.encrypted_filename,
        encrypted_dek=access.encrypted_dek,
        ciphertext=ciphertext,
        content_hash=doc.content_hash,
        access=grants,
    )


@router.post("/{document_id}/access", status_code=status.HTTP_204_NO_CONTENT)
async def share(
    document_id: UUID,
    body: ShareRequest,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Grant a new user access to a document the caller owns."""
    doc = await _get_owned_doc(db, document_id, current)

    # Recipient must exist and not be deleted.
    recipient = (
        await db.exec(
            select(User).where(User.id == body.user_id, User.deleted_at.is_(None))  # type: ignore[union-attr]
        )
    ).one_or_none()
    if recipient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recipient not found")

    # Idempotent: if the row exists, update the encrypted_dek.
    existing = (
        await db.exec(
            select(DocumentAccess).where(
                DocumentAccess.document_id == doc.id,
                DocumentAccess.user_id == body.user_id,
            )
        )
    ).one_or_none()
    if existing is not None:
        existing.encrypted_dek = body.encrypted_dek
        existing.granted_by = current.id
        existing.granted_at = datetime.now(UTC)
        db.add(existing)
    else:
        db.add(
            DocumentAccess(
                document_id=doc.id,
                user_id=body.user_id,
                encrypted_dek=body.encrypted_dek,
                granted_by=current.id,
            )
        )
    await audit_record(
        db,
        AuditAction.DOCUMENT_SHARE,
        user_id=current.id,
        target_id=doc.id,
        extra={"recipient": str(body.user_id)},
    )
    await db.commit()

    # Fire push to the grantee. Fire-and-forget so a slow push service
    # can't make the share request itself feel laggy. send_push opens
    # its own session (this one closes when the request returns).
    asyncio.create_task(  # noqa: RUF006 — intentional fire-and-forget
        send_push(
            user_id=body.user_id,
            payload={
                "type": "share",
                "from": current.username,
                "doc_id": str(doc.id),
            },
        )
    )


@router.delete("/{document_id}/access/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke(
    document_id: UUID,
    user_id: UUID,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Remove a user's access. Owner cannot revoke themselves."""
    doc = await _get_owned_doc(db, document_id, current)

    if user_id == current.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="owner cannot revoke their own access",
        )

    access = (
        await db.exec(
            select(DocumentAccess).where(
                DocumentAccess.document_id == doc.id,
                DocumentAccess.user_id == user_id,
            )
        )
    ).one_or_none()
    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="access row not found")

    await db.delete(access)
    await audit_record(
        db,
        AuditAction.DOCUMENT_REVOKE,
        user_id=current.id,
        target_id=doc.id,
        extra={"revoked": str(user_id)},
    )
    await db.commit()

    asyncio.create_task(  # noqa: RUF006 — intentional fire-and-forget
        send_push(
            user_id=user_id,
            payload={
                "type": "revoke",
                "from": current.username,
                "doc_id": str(doc.id),
            },
        )
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Delete the document + all access rows + the blob. Owner only."""
    doc = await _get_owned_doc(db, document_id, current)

    # Drop access rows first (FK).
    accesses = (
        await db.exec(select(DocumentAccess).where(DocumentAccess.document_id == doc.id))
    ).all()
    for a in accesses:
        await db.delete(a)

    # Soft-delete the document row; keep it for audit-log integrity.
    doc.deleted_at = datetime.now(UTC)
    db.add(doc)

    # Best-effort blob delete — if it fails the row is still soft-deleted.
    await asyncio.to_thread(_store().delete, doc.blob_key)

    await audit_record(db, AuditAction.DOCUMENT_DELETE, user_id=current.id, target_id=doc.id)
    await db.commit()


async def _get_owned_doc(db: AsyncSession, document_id: UUID, current: User) -> Document:
    """Fetch a document the current user owns, or 404."""
    doc = (
        await db.exec(
            select(Document).where(
                Document.id == document_id,
                Document.owner_id == current.id,
                Document.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
    ).one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")
    return doc


# ``uuid4`` is used in tests/scripts that import this module.
__all__ = ["router", "uuid4"]

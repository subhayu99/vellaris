"""Push-subscription management endpoints.

Four routes — three authenticated, one anonymous:

  * ``GET    /notifications/public-key``
        Anonymous. Returns the VAPID server public key the SPA needs to
        call ``pushManager.subscribe({applicationServerKey})``. Returns
        503 if push is disabled (no VAPID key configured) so the client
        can hide the Notifications UI gracefully.

  * ``POST   /notifications/subscriptions``
        Authenticated. Idempotent on (user_id, endpoint): re-subscribing
        the same browser replaces the keys + returns the same row id, so
        a SW ``pushsubscriptionchange`` rotation doesn't bloat the table.

  * ``DELETE /notifications/subscriptions/{id}``
        Authenticated, ownership-checked. Removes a single subscription;
        the OS-level subscription on the device isn't touched (the
        browser keeps it until the SPA also calls
        ``pushManager.unsubscribe()``).

  * ``GET    /notifications/subscriptions``
        Authenticated. Lists the caller's subscriptions for the
        Settings page — same shape as the passkeys list.

The actual ``send_push()`` happens in Phase 5; this module only wires
the subscription database.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.server.audit import record as audit_record
from vellaris.server.config import VellarisSettings, get_settings
from vellaris.server.db import get_session as get_db_session
from vellaris.server.models import AuditAction, PushSubscription
from vellaris.server.push import get_vapid_public_key_b64url
from vellaris.server.schemas import (
    PushSubscriptionCreate,
    PushSubscriptionListItem,
    PushSubscriptionResponse,
    PushVapidKeyResponse,
)
from vellaris.server.security import CurrentUser

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/public-key", response_model=PushVapidKeyResponse)
async def get_public_key(
    settings: Annotated[VellarisSettings, Depends(get_settings)],
) -> PushVapidKeyResponse:
    """Return the VAPID server public key + subject claim."""
    pub = get_vapid_public_key_b64url(settings)
    if pub is None:
        # Push is disabled. The SPA reads this 503 and skips the
        # subscribe flow entirely (Settings → Notifications shows
        # "Notifications are disabled on this server").
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="push notifications are disabled on this server",
        )
    return PushVapidKeyResponse(public_key=pub, subject=settings.vapid_subject)


@router.post(
    "/subscriptions",
    response_model=PushSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def subscribe(
    body: PushSubscriptionCreate,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[VellarisSettings, Depends(get_settings)],
) -> PushSubscriptionResponse:
    """Register a subscription for the calling user + their current browser.

    Idempotent: if the same ``endpoint`` is already in the table for any
    user, we update the row in place (replacing keys + reassigning the
    user) rather than rejecting the request. This handles two cases —
    the same browser on the same account re-subscribing after a
    pushsubscriptionchange, and a different account on the same browser
    overwriting the previous tenant.
    """
    if get_vapid_public_key_b64url(settings) is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="push notifications are disabled on this server",
        )

    existing = (
        await db.exec(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    ).one_or_none()

    if existing is not None:
        existing.user_id = current.id
        existing.p256dh_key = body.p256dh_key
        existing.auth_secret = body.auth_secret
        existing.user_agent = body.user_agent
        existing.friendly_name = body.friendly_name
        db.add(existing)
        await audit_record(
            db,
            AuditAction.PUSH_SUBSCRIBE,
            user_id=current.id,
            target_id=existing.id,
            extra={"friendly_name": existing.friendly_name},
        )
        await db.commit()
        await db.refresh(existing)
        return PushSubscriptionResponse(
            id=existing.id,
            endpoint=existing.endpoint,
            friendly_name=existing.friendly_name,
            user_agent=existing.user_agent,
            created_at=existing.created_at,
        )

    sub = PushSubscription(
        user_id=current.id,
        endpoint=body.endpoint,
        p256dh_key=body.p256dh_key,
        auth_secret=body.auth_secret,
        user_agent=body.user_agent,
        friendly_name=body.friendly_name,
    )
    db.add(sub)
    await audit_record(
        db,
        AuditAction.PUSH_SUBSCRIBE,
        user_id=current.id,
        target_id=sub.id,
        extra={"friendly_name": sub.friendly_name},
    )
    await db.commit()
    await db.refresh(sub)
    return PushSubscriptionResponse(
        id=sub.id,
        endpoint=sub.endpoint,
        friendly_name=sub.friendly_name,
        user_agent=sub.user_agent,
        created_at=sub.created_at,
    )


@router.delete("/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    subscription_id: UUID,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Remove a subscription, ownership-checked."""
    sub = (
        await db.exec(
            select(PushSubscription).where(
                PushSubscription.id == subscription_id,
                PushSubscription.user_id == current.id,
            )
        )
    ).one_or_none()
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subscription not found")
    await db.delete(sub)
    await audit_record(
        db,
        AuditAction.PUSH_UNSUBSCRIBE,
        user_id=current.id,
        target_id=sub.id,
        extra={"friendly_name": sub.friendly_name},
    )
    await db.commit()


@router.get("/subscriptions", response_model=list[PushSubscriptionListItem])
async def list_subscriptions(
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[PushSubscriptionListItem]:
    """Return the caller's registered devices for the Settings page."""
    rows = (
        await db.exec(
            select(PushSubscription)
            .where(PushSubscription.user_id == current.id)
            .order_by(PushSubscription.created_at)  # type: ignore[arg-type]
        )
    ).all()
    return [
        PushSubscriptionListItem(
            id=r.id,
            friendly_name=r.friendly_name,
            user_agent=r.user_agent,
            created_at=r.created_at,
            last_used_at=r.last_used_at,
        )
        for r in rows
    ]

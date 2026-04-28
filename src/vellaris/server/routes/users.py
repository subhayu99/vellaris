"""Signup + user lookup routes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.core.asymmetric import deserialize_public_key
from vellaris.core.errors import KeyFormatError
from vellaris.server.db import get_session as get_db_session
from vellaris.server.models import User
from vellaris.server.schemas import UserCreate, UserPrivate, UserPublic
from vellaris.server.security import CurrentUser

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=UserPrivate)
async def signup(
    body: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    """Create a new user. Server stores only the public key — no password ever."""
    # Validate the public key parses as a real RSA SPKI; reject malformed payloads upfront.
    try:
        deserialize_public_key(body.public_key)
    except KeyFormatError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"invalid public key: {exc}"
        ) from exc

    user = User(username=body.username, email=body.email, public_key=body.public_key)
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="username or email already taken"
        ) from exc
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserPrivate)
async def me(current: CurrentUser) -> User:
    return current


@router.get("/by-id/{user_id}", response_model=UserPublic)
async def by_id(
    user_id: UUID,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    _ = current  # auth required, but the response shape is the same regardless of identity
    user = (
        await db.exec(select(User).where(User.id == user_id, User.deleted_at.is_(None)))  # type: ignore[union-attr]
    ).one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    return user


@router.get("/by-username/{username}", response_model=UserPublic)
async def by_username(
    username: str,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    _ = current
    user = (
        await db.exec(
            select(User).where(User.username == username, User.deleted_at.is_(None))  # type: ignore[union-attr]
        )
    ).one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    return user

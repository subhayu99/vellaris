"""FastAPI dependency: validate the Bearer token, return the authenticated user."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel.ext.asyncio.session import AsyncSession

from vellaris.server.db import get_session as get_db_session
from vellaris.server.models import User
from vellaris.server.sessions import get_session_by_token, load_user, touch_session

# auto_error=False so we can return a custom 401 with a clear message instead of
# FastAPI's generic "Not authenticated" body.
_bearer = HTTPBearer(auto_error=False, description="Opaque Vellaris session token.")


async def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    """Return the User attached to the Bearer token, or raise 401."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    session = await get_session_by_token(db, credentials.credentials)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired session",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await load_user(db, session.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user account is no longer available",
            headers={"WWW-Authenticate": "Bearer"},
        )

    await touch_session(db, session)
    await db.commit()
    return user


CurrentUser = Annotated[User, Depends(current_user)]

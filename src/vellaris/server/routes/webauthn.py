"""WebAuthn / passkey enrollment + authentication.

Two ceremonies, four endpoints:

  * ``POST /webauthn/register/{begin,finish}`` — authenticated user adds a
    new passkey to their account. Begin returns a challenge + options the
    browser feeds to ``navigator.credentials.create()``; finish stores
    the resulting credential plus an opaque AES-GCM-wrapped copy of the
    user's RSA private key (encrypted client-side under the credential's
    PRF output).

  * ``POST /webauthn/auth/{begin,finish}`` — anonymous login flow. Begin
    issues a challenge and an ``allowCredentials`` list (or an empty list
    for username-less / discoverable-credential flows); finish verifies
    the assertion and issues a Vellaris session token *plus* returns the
    wrapped-key blob so the client can decrypt it under the PRF output.

The PRF output never reaches the server. The wrapped-key is opaque
ciphertext bound (via AES-GCM AAD) to the credential it was wrapped
under, so even if the database were stolen, an attacker would still need
the authenticator hardware to derive the unwrap key.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.exceptions import (
    InvalidAuthenticationResponse,
    InvalidRegistrationResponse,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    PublicKeyCredentialType,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from vellaris.server.audit import record as audit_record
from vellaris.server.config import VellarisSettings, get_settings
from vellaris.server.db import get_session as get_db_session
from vellaris.server.models import (
    AuditAction,
    User,
    WebAuthnChallenge,
    WebAuthnCredential,
)
from vellaris.server.schemas import (
    PasskeyAuthBeginRequest,
    PasskeyAuthBeginResponse,
    PasskeyAuthFinishRequest,
    PasskeyAuthFinishResponse,
    PasskeyRegisterBeginResponse,
    PasskeyRegisterFinishRequest,
    PasskeySummary,
    UserPrivate,
)
from vellaris.server.security import CurrentUser
from vellaris.server.sessions import create_session

router = APIRouter(prefix="/webauthn", tags=["webauthn"])


# ---------- helpers ----------


# The PRF eval input — same on every register + auth so the same passkey
# always derives the same unwrap key. SHA-256 of a fixed domain-separator
# string keeps the input random-looking and ≥32 bytes.
PRF_SALT_INPUT = (
    b"\x9c\x4d\xc8\xa3\x4f\x0b\x6a\x5e"
    b"\x71\x88\xe2\x05\xc6\xfb\x33\x9c"
    b"\xa9\x71\x4e\x10\xd2\xc8\x6e\xa1"
    b"\x4f\x29\x68\x59\x76\xf2\x8d\x47"
)


def _parse_transports(value: str) -> list[str]:
    return [t for t in value.split(",") if t]


def _serialize_transports(transports: list[str] | None) -> str:
    if not transports:
        return ""
    # Drop anything not in the canonical set so we don't store random strings.
    allowed = {t.value for t in AuthenticatorTransport}
    return ",".join(t for t in transports if t in allowed)


async def _new_challenge(
    db: AsyncSession,
    *,
    user_id: UUID | None,
    challenge: bytes,
    purpose: str,
    settings: VellarisSettings,
) -> WebAuthnChallenge:
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.challenge_ttl_seconds)
    row = WebAuthnChallenge(
        user_id=user_id,
        challenge=challenge,
        purpose=purpose,
        expires_at=expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def _consume_challenge(
    db: AsyncSession,
    challenge_id: UUID,
    *,
    purpose: str,
) -> WebAuthnChallenge:
    row = (
        await db.exec(select(WebAuthnChallenge).where(WebAuthnChallenge.id == challenge_id))
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="webauthn challenge not found"
        )
    # Always single-use: delete on read so a reused challenge_id can't be replayed.
    await db.delete(row)
    if row.purpose != purpose:
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"webauthn challenge is for {row.purpose}, not {purpose}",
        )
    if row.expires_at <= datetime.now(UTC):
        await db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="webauthn challenge expired")
    return row


def _inject_prf_extension(options_json: str) -> str:
    """Add the PRF extension to a serialized options blob.

    The Python ``webauthn`` library's options dataclasses don't expose
    PRF natively, but the extension is purely a client-side hint: the
    authenticator evaluates a PRF over the eval input and returns the
    32-byte output to JS via ``getClientExtensionResults().prf.results``.
    Server doesn't need to verify it — and indeed cannot, since the
    PRF output never reaches the server. So we just splice it into
    the JSON the client receives.

    The ``first`` field is base64url(no padding)-encoded per WebAuthn
    convention.
    """
    import base64

    payload: dict[str, object] = json.loads(options_json)
    salt_b64 = base64.urlsafe_b64encode(PRF_SALT_INPUT).rstrip(b"=").decode("ascii")
    extensions = payload.setdefault("extensions", {})
    if not isinstance(extensions, dict):  # pragma: no cover - shape-guarantee from py_webauthn
        raise TypeError("options.extensions must be an object")
    extensions["prf"] = {"eval": {"first": salt_b64}}
    return json.dumps(payload)


# ---------- registration ----------


@router.post(
    "/register/begin",
    response_model=PasskeyRegisterBeginResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_begin(
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[VellarisSettings, Depends(get_settings)],
) -> PasskeyRegisterBeginResponse:
    """Issue a fresh challenge + options for registering a new passkey."""
    existing_creds = (
        await db.exec(select(WebAuthnCredential).where(WebAuthnCredential.user_id == current.id))
    ).all()

    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=current.id.bytes,
        user_name=current.username,
        user_display_name=current.username,
        # User verification is REQUIRED: an E2E document store whose whole
        # promise is "your face / fingerprint unlocks your files" cannot
        # accept an authenticator that skipped UV. Hardware keys without
        # a configured PIN are correctly rejected by this setting.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=c.credential_id) for c in existing_creds
        ],
    )

    row = await _new_challenge(
        db,
        user_id=current.id,
        challenge=options.challenge,
        purpose="register",
        settings=settings,
    )

    return PasskeyRegisterBeginResponse(
        challenge_id=row.id,
        options_json=_inject_prf_extension(options_to_json(options)),
    )


@router.post(
    "/register/finish",
    response_model=PasskeySummary,
    status_code=status.HTTP_201_CREATED,
)
async def register_finish(
    body: PasskeyRegisterFinishRequest,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[VellarisSettings, Depends(get_settings)],
) -> PasskeySummary:
    """Verify the attestation and store the credential + wrapped key."""
    challenge = await _consume_challenge(db, body.challenge_id, purpose="register")
    if challenge.user_id != current.id:
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="webauthn challenge belongs to a different user",
        )

    try:
        verification = verify_registration_response(
            credential=body.credential_json,
            expected_challenge=challenge.challenge,
            expected_origin=settings.webauthn_rp_origins,
            expected_rp_id=settings.webauthn_rp_id,
            require_user_verification=True,
        )
    except InvalidRegistrationResponse as exc:
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"webauthn registration failed: {exc}",
        ) from exc

    cred = WebAuthnCredential(
        user_id=current.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=_serialize_transports(body.transports),
        name=body.name.strip() or "Unnamed passkey",
        wrapped_key=body.wrapped_key,
    )
    db.add(cred)
    await audit_record(
        db,
        AuditAction.PASSKEY_REGISTER,
        user_id=current.id,
        target_id=cred.id,
        extra={"name": cred.name, "transports": cred.transports},
    )
    await db.commit()
    await db.refresh(cred)

    return PasskeySummary(
        id=cred.id,
        name=cred.name,
        transports=_parse_transports(cred.transports),
        created_at=cred.created_at,
        last_used_at=cred.last_used_at,
    )


# ---------- list / delete ----------


@router.get("/credentials", response_model=list[PasskeySummary])
async def list_credentials(
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[PasskeySummary]:
    """Return the caller's registered passkeys (no public-key bytes)."""
    rows = (
        await db.exec(
            select(WebAuthnCredential)
            .where(WebAuthnCredential.user_id == current.id)
            .order_by(WebAuthnCredential.created_at)  # type: ignore[arg-type]
        )
    ).all()
    return [
        PasskeySummary(
            id=r.id,
            name=r.name,
            transports=_parse_transports(r.transports),
            created_at=r.created_at,
            last_used_at=r.last_used_at,
        )
        for r in rows
    ]


@router.delete("/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id: UUID,
    current: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Remove a registered passkey. The platform-side credential isn't deleted."""
    cred = (
        await db.exec(
            select(WebAuthnCredential).where(
                WebAuthnCredential.id == credential_id,
                WebAuthnCredential.user_id == current.id,
            )
        )
    ).one_or_none()
    if cred is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="passkey not found")
    await db.delete(cred)
    await audit_record(
        db,
        AuditAction.PASSKEY_DELETE,
        user_id=current.id,
        target_id=cred.id,
        extra={"name": cred.name},
    )
    await db.commit()


# ---------- authentication ----------


@router.post(
    "/auth/begin",
    response_model=PasskeyAuthBeginResponse,
    status_code=status.HTTP_201_CREATED,
)
async def auth_begin(
    body: PasskeyAuthBeginRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[VellarisSettings, Depends(get_settings)],
) -> PasskeyAuthBeginResponse:
    """Issue an authentication challenge (anonymous endpoint)."""
    user_id: UUID | None = None
    allow_credentials: list[PublicKeyCredentialDescriptor] = []

    if body.username:
        user = (await db.exec(select(User).where(User.username == body.username))).one_or_none()
        if user is not None and user.deleted_at is None:
            user_id = user.id
            rows = (
                await db.exec(
                    select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id)
                )
            ).all()
            allow_credentials = [
                PublicKeyCredentialDescriptor(
                    id=r.credential_id,
                    type=PublicKeyCredentialType.PUBLIC_KEY,
                    transports=[
                        AuthenticatorTransport(t)
                        for t in _parse_transports(r.transports)
                        if t in {at.value for at in AuthenticatorTransport}
                    ]
                    or None,
                )
                for r in rows
            ]
        # If user not found or has no passkeys, fall through with empty allow_credentials —
        # don't disclose which case we're in (timing aside).

    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        allow_credentials=allow_credentials or None,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    row = await _new_challenge(
        db,
        user_id=user_id,
        challenge=options.challenge,
        purpose="auth",
        settings=settings,
    )

    return PasskeyAuthBeginResponse(
        challenge_id=row.id,
        options_json=_inject_prf_extension(options_to_json(options)),
    )


@router.post("/auth/finish", response_model=PasskeyAuthFinishResponse)
async def auth_finish(
    body: PasskeyAuthFinishRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[VellarisSettings, Depends(get_settings)],
) -> PasskeyAuthFinishResponse:
    """Verify the assertion, issue a session token, return the wrapped key."""
    challenge = await _consume_challenge(db, body.challenge_id, purpose="auth")

    # Pull the credential the assertion claims to be for. The webauthn lib
    # parses the credential JSON itself; we do an early lookup here to fetch
    # the stored public key + sign_count for verification.
    try:
        cred_dict = json.loads(body.credential_json)
        raw_id_b64 = cred_dict.get("rawId") or cred_dict.get("id")
    except (json.JSONDecodeError, AttributeError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"malformed credential JSON: {exc}",
        ) from exc
    if not raw_id_b64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="credential is missing rawId/id",
        )

    import base64

    try:
        # Browser-emitted base64url, possibly without padding.
        padded = raw_id_b64 + "=" * (-len(raw_id_b64) % 4)
        credential_id_bytes = base64.urlsafe_b64decode(padded)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"credential rawId is not valid base64url: {exc}",
        ) from exc

    cred = (
        await db.exec(
            select(WebAuthnCredential).where(
                WebAuthnCredential.credential_id == credential_id_bytes
            )
        )
    ).one_or_none()
    if cred is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="passkey not registered for any account",
        )

    user = (await db.exec(select(User).where(User.id == cred.user_id))).one_or_none()
    if user is None or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user account is no longer available",
        )

    try:
        verification = verify_authentication_response(
            credential=body.credential_json,
            expected_challenge=challenge.challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_rp_origins,
            credential_public_key=cred.public_key,
            credential_current_sign_count=cred.sign_count,
            require_user_verification=True,
        )
    except InvalidAuthenticationResponse as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"webauthn signature verification failed: {exc}",
        ) from exc

    cred.sign_count = verification.new_sign_count
    cred.last_used_at = datetime.now(UTC)
    db.add(cred)

    session = await create_session(db, user, settings=settings)
    await audit_record(
        db,
        AuditAction.PASSKEY_LOGIN,
        user_id=user.id,
        target_id=cred.id,
        extra={"name": cred.name},
    )
    await db.commit()
    await db.refresh(session)
    await db.refresh(user)
    await db.refresh(cred)

    return PasskeyAuthFinishResponse(
        token=session.token,
        expires_at=session.expires_at,
        user=UserPrivate.model_validate(user, from_attributes=True),
        wrapped_key=cred.wrapped_key,
    )

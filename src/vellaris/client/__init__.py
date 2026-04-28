"""Public Vellaris SDK.

Two flavours:

- :class:`AsyncClient` — async/await native, recommended for FastAPI/asyncio apps.
- :class:`Client` — sync facade that runs the async client under the hood;
  ergonomic for scripts, Jupyter notebooks, the CLI.

Both share the same crypto code path (:mod:`vellaris.client.crypto`), so the
on-wire format never diverges.
"""

from __future__ import annotations

import asyncio
import base64
from collections.abc import Awaitable, Callable
from pathlib import Path
from types import TracebackType
from typing import Any, TypeVar
from uuid import UUID

import httpx
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

from vellaris.client.api import VellarisAPIError, VellarisAsyncClient
from vellaris.client.config import VellarisConfig
from vellaris.client.crypto import (
    DecryptedDocument,
    EncryptedDocument,
    Recipient,
    decrypt_bundle,
    encrypt_for_recipients,
)
from vellaris.client.keystore import KeyStore
from vellaris.core.asymmetric import (
    deserialize_private_key,
    deserialize_public_key,
    generate_keypair,
    oaep_decrypt,
    oaep_encrypt,
    pss_sign,
    serialize_private_key,
    serialize_public_key,
)
from vellaris.core.kdf import Argon2Params
from vellaris.core.wrap import unwrap_private_key, wrap_private_key

__all__ = [
    "AsyncClient",
    "Client",
    "DecryptedDocument",
    "EncryptedDocument",
    "Recipient",
    "VellarisAPIError",
    "VellarisAsyncClient",
    "VellarisConfig",
]


def _b64d(value: str) -> bytes:
    return base64.b64decode(value)


T = TypeVar("T")


class AsyncClient:
    """High-level async SDK that wraps :class:`VellarisAsyncClient` + crypto + key store."""

    def __init__(
        self,
        server_url: str,
        *,
        token: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        keystore: KeyStore | None = None,
    ) -> None:
        self._api = VellarisAsyncClient(server_url, token=token, transport=transport)
        self._keystore = keystore or KeyStore()
        self._private_key: RSAPrivateKey | None = None
        self._user: dict[str, Any] | None = None

    # ---------- lifecycle ----------

    async def __aenter__(self) -> AsyncClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.close()

    async def close(self) -> None:
        await self._api.close()

    # ---------- introspection ----------

    @property
    def server_url(self) -> str:
        return self._api.server_url

    @property
    def token(self) -> str | None:
        return self._api.token

    def set_token(self, token: str | None) -> None:
        self._api.set_token(token)

    @property
    def private_key(self) -> RSAPrivateKey | None:
        return self._private_key

    def set_private_key(self, private_key: RSAPrivateKey | None) -> None:
        self._private_key = private_key

    @property
    def user(self) -> dict[str, Any] | None:
        return self._user

    def set_user(self, user: dict[str, Any] | None) -> None:
        self._user = user

    # ---------- signup ----------

    async def signup(
        self,
        *,
        username: str,
        email: str,
        passphrase: str,
        kdf_params: Argon2Params | None = None,
    ) -> dict[str, Any]:
        """Generate keys client-side, post the public key, store the wrapped private key locally."""
        kp = generate_keypair()
        self._private_key = kp.private_key

        public_pem = serialize_public_key(kp.public_key)
        user = await self._api.signup(username=username, email=email, public_key=public_pem)
        self._user = user

        wrapped = wrap_private_key(
            serialize_private_key(kp.private_key), passphrase, params=kdf_params
        )
        self._keystore.write_blob(UUID(user["id"]), wrapped)
        return user

    # ---------- login ----------

    async def login(self, username: str, passphrase: str) -> dict[str, Any]:
        """Run the challenge-response flow; cache the session token + private key in memory."""
        challenge_id, nonce, _ = await self._api.challenge(username)

        candidates = self._keystore.list_users()
        if not candidates:
            raise FileNotFoundError(
                "no wrapped key file for any user; sign up first or import a key"
            )

        last_error: Exception | None = None
        for candidate in candidates:
            try:
                pem = unwrap_private_key(self._keystore.read_blob(candidate), passphrase)
            except Exception as exc:
                last_error = exc
                continue
            try:
                priv = deserialize_private_key(pem)
                signature = pss_sign(challenge_id.bytes + nonce, priv)
                _token, _expires, user = await self._api.verify(challenge_id, signature)
                if user.get("username") != username:
                    self._api.set_token(None)
                    last_error = RuntimeError(
                        f"key file for {candidate} doesn't match server username '{username}'"
                    )
                    continue
                self._private_key = priv
                self._user = user
                return user
            except Exception as exc:
                last_error = exc
                continue

        if last_error is not None:
            raise last_error
        raise RuntimeError("unable to log in with any local key")

    # ---------- logout ----------

    async def logout(self) -> None:
        await self._api.logout()
        self._private_key = None
        self._user = None

    # ---------- introspection passthroughs ----------

    async def whoami(self) -> dict[str, Any]:
        return await self._api.me()

    async def get_user_by_username(self, username: str) -> dict[str, Any]:
        return await self._api.get_user_by_username(username)

    async def get_user_by_id(self, user_id: UUID) -> dict[str, Any]:
        return await self._api.get_user_by_id(user_id)

    # ---------- documents ----------

    async def push(self, file_path: Path, *, share_with: list[str] | None = None) -> dict[str, Any]:
        """Encrypt and upload a file. ``share_with`` is a list of usernames.

        Only the owner's *public* key is needed; the private key stays untouched.
        Re-fetches /users/me if the cached user dict lacks public_key (the CLI
        builds a fresh Client per command and only carries id/username).
        """
        if self._user is None or "public_key" not in self._user:
            self._user = await self._api.me()

        plaintext = file_path.read_bytes()
        recipients: list[Recipient] = [
            Recipient(
                user_id=UUID(self._user["id"]),
                public_key=deserialize_public_key(_b64d(self._user["public_key"])),
            )
        ]

        for username in share_with or []:
            other = await self._api.get_user_by_username(username)
            recipients.append(
                Recipient(
                    user_id=UUID(other["id"]),
                    public_key=deserialize_public_key(_b64d(other["public_key"])),
                )
            )

        bundle = encrypt_for_recipients(
            plaintext=plaintext, filename=file_path.name, recipients=recipients
        )
        return await self._api.upload_document(
            encrypted_filename=bundle.encrypted_filename,
            content_hash=bundle.content_hash,
            ciphertext=bundle.ciphertext,
            access=bundle.access,
        )

    async def pull(self, document_id: UUID) -> DecryptedDocument:
        if self._private_key is None:
            raise RuntimeError("not logged in")

        payload = await self._api.download_document(document_id)
        return decrypt_bundle(
            ciphertext_blob=_b64d(payload["ciphertext"]),
            encrypted_filename_blob=_b64d(payload["encrypted_filename"]),
            encrypted_dek=_b64d(payload["encrypted_dek"]),
            private_key=self._private_key,
        )

    async def list_docs(self, *, scope: str = "all") -> list[dict[str, Any]]:
        return await self._api.list_documents(scope=scope)

    async def share_document(self, document_id: UUID, username: str) -> None:
        if self._private_key is None:
            raise RuntimeError("not logged in")
        # Server returns OUR encrypted_dek; decrypt it and rewrap for the recipient.
        payload = await self._api.download_document(document_id)
        dek = oaep_decrypt(_b64d(payload["encrypted_dek"]), self._private_key)

        recipient = await self._api.get_user_by_username(username)
        recipient_pubkey = deserialize_public_key(_b64d(recipient["public_key"]))
        encrypted_dek = oaep_encrypt(dek, recipient_pubkey)

        await self._api.share(
            document_id, user_id=UUID(recipient["id"]), encrypted_dek=encrypted_dek
        )

    async def revoke_document(self, document_id: UUID, username: str) -> None:
        recipient = await self._api.get_user_by_username(username)
        await self._api.revoke(document_id, user_id=UUID(recipient["id"]))

    async def delete_document(self, document_id: UUID) -> None:
        await self._api.delete_document(document_id)

    # ---------- key management ----------

    async def export_key(self, dest_path: Path, *, user_id: UUID | None = None) -> Path:
        """Copy the wrapped key blob to ``dest_path``."""
        target_id = user_id or (UUID(self._user["id"]) if self._user else None)
        if target_id is None:
            raise RuntimeError("no user; specify user_id or log in first")
        blob = self._keystore.read_blob(target_id)
        dest_path.write_bytes(blob)
        import os

        os.chmod(dest_path, 0o600)
        return dest_path

    async def import_key(self, src_path: Path, user_id: UUID) -> None:
        """Import a wrapped key blob from ``src_path`` for ``user_id``."""
        self._keystore.write_blob(user_id, src_path.read_bytes())

    async def push_keyblob(self, *, user_id: UUID | None = None) -> None:
        target_id = user_id or (UUID(self._user["id"]) if self._user else None)
        if target_id is None:
            raise RuntimeError("no user; specify user_id or log in first")
        await self._api.push_keyblob(self._keystore.read_blob(target_id))

    async def pull_keyblob(self, *, user_id: UUID | None = None) -> None:
        target_id = user_id or (UUID(self._user["id"]) if self._user else None)
        if target_id is None:
            raise RuntimeError("no user; specify user_id or log in first")
        blob = await self._api.pull_keyblob()
        self._keystore.write_blob(target_id, blob)

    async def delete_remote_keyblob(self) -> None:
        await self._api.delete_keyblob()


class Client:
    """Sync facade over :class:`AsyncClient`. One ``asyncio.run`` per call.

    Suitable for CLIs, Jupyter notebooks, and scripts. For long-running
    services, use :class:`AsyncClient` directly to share an event loop.
    """

    def __init__(
        self,
        server_url: str,
        *,
        token: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        keystore: KeyStore | None = None,
    ) -> None:
        self._server_url = server_url
        self._transport = transport
        self._keystore = keystore
        self._token: str | None = token
        self._private_key: RSAPrivateKey | None = None
        self._user: dict[str, Any] | None = None

    def _run(self, fn: Callable[[AsyncClient], Awaitable[T]]) -> T:
        async def _wrapped() -> T:
            async with AsyncClient(
                self._server_url,
                token=self._token,
                transport=self._transport,
                keystore=self._keystore,
            ) as ac:
                if self._private_key is not None:
                    ac.set_private_key(self._private_key)
                if self._user is not None:
                    ac.set_user(self._user)
                result = await fn(ac)
                self._token = ac.token
                self._private_key = ac.private_key
                self._user = ac.user
                return result

        return asyncio.run(_wrapped())

    # ---------- public surface ----------

    @property
    def server_url(self) -> str:
        return self._server_url

    @property
    def token(self) -> str | None:
        return self._token

    @property
    def user(self) -> dict[str, Any] | None:
        return self._user

    def signup(
        self,
        *,
        username: str,
        email: str,
        passphrase: str,
        kdf_params: Argon2Params | None = None,
    ) -> dict[str, Any]:
        return self._run(
            lambda ac: ac.signup(
                username=username, email=email, passphrase=passphrase, kdf_params=kdf_params
            )
        )

    def login(self, username: str, passphrase: str) -> dict[str, Any]:
        return self._run(lambda ac: ac.login(username, passphrase))

    def logout(self) -> None:
        self._run(lambda ac: ac.logout())

    def whoami(self) -> dict[str, Any]:
        return self._run(lambda ac: ac.whoami())

    def get_user_by_username(self, username: str) -> dict[str, Any]:
        return self._run(lambda ac: ac.get_user_by_username(username))

    def push(self, file_path: Path, *, share_with: list[str] | None = None) -> dict[str, Any]:
        return self._run(lambda ac: ac.push(file_path, share_with=share_with))

    def pull(self, document_id: UUID) -> DecryptedDocument:
        return self._run(lambda ac: ac.pull(document_id))

    def list_docs(self, *, scope: str = "all") -> list[dict[str, Any]]:
        return self._run(lambda ac: ac.list_docs(scope=scope))

    def share_document(self, document_id: UUID, username: str) -> None:
        self._run(lambda ac: ac.share_document(document_id, username))

    def revoke_document(self, document_id: UUID, username: str) -> None:
        self._run(lambda ac: ac.revoke_document(document_id, username))

    def delete_document(self, document_id: UUID) -> None:
        self._run(lambda ac: ac.delete_document(document_id))

    def export_key(self, dest_path: Path, *, user_id: UUID | None = None) -> Path:
        return self._run(lambda ac: ac.export_key(dest_path, user_id=user_id))

    def import_key(self, src_path: Path, user_id: UUID) -> None:
        self._run(lambda ac: ac.import_key(src_path, user_id))

    def push_keyblob(self, *, user_id: UUID | None = None) -> None:
        self._run(lambda ac: ac.push_keyblob(user_id=user_id))

    def pull_keyblob(self, *, user_id: UUID | None = None) -> None:
        self._run(lambda ac: ac.pull_keyblob(user_id=user_id))

    def delete_remote_keyblob(self) -> None:
        self._run(lambda ac: ac.delete_remote_keyblob())

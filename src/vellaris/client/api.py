"""Async HTTP client for the Vellaris server.

Thin wrapper over :mod:`httpx` that mirrors the server's route surface.
Tests can pass ``transport=ASGITransport(app=create_app())`` to drive
the server in-process without binding a real socket.
"""

from __future__ import annotations

import base64
from datetime import datetime
from types import TracebackType
from typing import Any
from uuid import UUID

import httpx


class VellarisAPIError(Exception):
    """Server returned a non-2xx status."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(f"HTTP {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _b64d(value: str) -> bytes:
    return base64.b64decode(value)


class VellarisAsyncClient:
    """Async wrapper around the Vellaris HTTP API."""

    def __init__(
        self,
        server_url: str,
        *,
        token: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._server_url = server_url.rstrip("/")
        self._token = token
        self._client = httpx.AsyncClient(
            base_url=self._server_url,
            transport=transport,
            timeout=timeout,
            headers={"Accept": "application/json"},
        )

    # ---------- lifecycle ----------

    async def __aenter__(self) -> VellarisAsyncClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.aclose()

    # ---------- token state ----------

    @property
    def server_url(self) -> str:
        return self._server_url

    @property
    def token(self) -> str | None:
        return self._token

    def set_token(self, token: str | None) -> None:
        self._token = token

    def _auth_headers(self) -> dict[str, str]:
        if self._token is None:
            return {}
        return {"Authorization": f"Bearer {self._token}"}

    # ---------- internal helpers ----------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        expect_status: int | tuple[int, ...] = 200,
        require_auth: bool = False,
    ) -> httpx.Response:
        headers = self._auth_headers() if require_auth else {}
        response = await self._client.request(method, path, json=json, headers=headers)
        ok = (expect_status,) if isinstance(expect_status, int) else expect_status
        if response.status_code not in ok:
            try:
                detail = response.json().get("detail", response.text)
            except Exception:
                detail = response.text
            raise VellarisAPIError(response.status_code, str(detail))
        return response

    # ---------- meta ----------

    async def health(self) -> dict[str, str]:
        resp = await self._request("GET", "/health")
        result: dict[str, str] = resp.json()
        return result

    # ---------- auth ----------

    async def signup(self, *, username: str, email: str, public_key: bytes) -> dict[str, Any]:
        body = {"username": username, "email": email, "public_key": _b64(public_key)}
        resp = await self._request("POST", "/users", json=body, expect_status=201)
        result: dict[str, Any] = resp.json()
        return result

    async def challenge(self, username: str) -> tuple[UUID, bytes, datetime]:
        resp = await self._request(
            "POST", "/auth/challenge", json={"username": username}, expect_status=201
        )
        body = resp.json()
        return (
            UUID(body["challenge_id"]),
            _b64d(body["nonce"]),
            datetime.fromisoformat(body["expires_at"]),
        )

    async def verify(
        self, challenge_id: UUID, signature: bytes
    ) -> tuple[str, datetime, dict[str, Any]]:
        resp = await self._request(
            "POST",
            "/auth/verify",
            json={"challenge_id": str(challenge_id), "signature": _b64(signature)},
        )
        body = resp.json()
        token = body["token"]
        self.set_token(token)
        return (
            token,
            datetime.fromisoformat(body["expires_at"]),
            body["user"],
        )

    async def logout(self) -> None:
        await self._request("POST", "/auth/logout", expect_status=204, require_auth=True)
        self.set_token(None)

    # ---------- users ----------

    async def me(self) -> dict[str, Any]:
        resp = await self._request("GET", "/users/me", require_auth=True)
        result: dict[str, Any] = resp.json()
        return result

    async def get_user_by_id(self, user_id: UUID) -> dict[str, Any]:
        resp = await self._request("GET", f"/users/by-id/{user_id}", require_auth=True)
        result: dict[str, Any] = resp.json()
        return result

    async def get_user_by_username(self, username: str) -> dict[str, Any]:
        resp = await self._request("GET", f"/users/by-username/{username}", require_auth=True)
        result: dict[str, Any] = resp.json()
        return result

    # ---------- documents ----------

    async def upload_document(
        self,
        *,
        encrypted_filename: bytes,
        content_hash: str,
        ciphertext: bytes,
        access: list[tuple[UUID, bytes]],
    ) -> dict[str, Any]:
        body = {
            "encrypted_filename": _b64(encrypted_filename),
            "content_hash": content_hash,
            "ciphertext": _b64(ciphertext),
            "access": [{"user_id": str(uid), "encrypted_dek": _b64(dek)} for uid, dek in access],
        }
        resp = await self._request(
            "POST", "/documents", json=body, expect_status=201, require_auth=True
        )
        result: dict[str, Any] = resp.json()
        return result

    async def list_documents(self, *, scope: str = "all") -> list[dict[str, Any]]:
        resp = await self._request("GET", f"/documents?scope={scope}", require_auth=True)
        result: list[dict[str, Any]] = resp.json()
        return result

    async def download_document(self, document_id: UUID) -> dict[str, Any]:
        resp = await self._request("GET", f"/documents/{document_id}", require_auth=True)
        result: dict[str, Any] = resp.json()
        return result

    async def share(self, document_id: UUID, *, user_id: UUID, encrypted_dek: bytes) -> None:
        body = {"user_id": str(user_id), "encrypted_dek": _b64(encrypted_dek)}
        await self._request(
            "POST",
            f"/documents/{document_id}/access",
            json=body,
            expect_status=204,
            require_auth=True,
        )

    async def revoke(self, document_id: UUID, *, user_id: UUID) -> None:
        await self._request(
            "DELETE",
            f"/documents/{document_id}/access/{user_id}",
            expect_status=204,
            require_auth=True,
        )

    async def delete_document(self, document_id: UUID) -> None:
        await self._request(
            "DELETE",
            f"/documents/{document_id}",
            expect_status=204,
            require_auth=True,
        )

    # ---------- key blobs ----------

    async def push_keyblob(self, wrapped_key: bytes) -> None:
        await self._request(
            "PUT",
            "/key-blobs/me",
            json={"wrapped_key": _b64(wrapped_key)},
            require_auth=True,
        )

    async def pull_keyblob(self) -> bytes:
        resp = await self._request("GET", "/key-blobs/me", require_auth=True)
        return _b64d(resp.json()["wrapped_key"])

    async def delete_keyblob(self) -> None:
        await self._request("DELETE", "/key-blobs/me", expect_status=204, require_auth=True)

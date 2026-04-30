"""fsspec-backed BlobStore — works with local FS, S3, GCS, Azure, memory, etc.

Constructed from a single URL plus an optional ``storage_options`` dict.
fsspec resolves the URL to an ``AbstractFileSystem`` and a path; we keep
that path as our key prefix.

fsspec backends are sync; routes wrap calls in ``asyncio.to_thread``.
"""

from __future__ import annotations

from typing import Any

import fsspec
from fsspec.implementations.local import LocalFileSystem

from vellaris.server.storage import BlobNotFound, validate_key


class FsspecBlobStore:
    """Adapt any fsspec filesystem to the :class:`BlobStore` Protocol."""

    def __init__(self, url: str, *, storage_options: dict[str, Any] | None = None) -> None:
        opts = dict(storage_options or {})
        # Default auto_mkdir for local FS so nested keys work without explicit mkdir.
        if url.startswith("file://") or url.startswith("/") or "://" not in url:
            opts.setdefault("auto_mkdir", True)
        self._fs, self._root = fsspec.core.url_to_fs(url, **opts)
        # Ensure the root exists on local FS — fsspec.url_to_fs doesn't always create it.
        if isinstance(self._fs, LocalFileSystem):
            self._fs.makedirs(self._root, exist_ok=True)

    def _path(self, key: str) -> str:
        validate_key(key)
        return f"{self._root.rstrip('/')}/{key}"

    def put(self, key: str, data: bytes) -> None:
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError(f"data must be bytes, got {type(data).__name__}")
        path = self._path(key)
        if isinstance(self._fs, LocalFileSystem):
            # Atomic write via temp+rename so a crash mid-write doesn't leave a
            # half-blob at the canonical key path. Cloud backends (s3fs/gcsfs/adlfs)
            # are already atomic via their multipart commit protocols, so direct
            # write is safe there.
            import os

            tmp = f"{path}.tmp"
            with self._fs.open(tmp, "wb") as f:
                f.write(bytes(data))
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        else:
            with self._fs.open(path, "wb") as f:
                f.write(bytes(data))

    def get(self, key: str) -> bytes:
        path = self._path(key)
        try:
            with self._fs.open(path, "rb") as f:
                return bytes(f.read())
        except (FileNotFoundError, KeyError) as exc:
            raise BlobNotFound(key) from exc

    def delete(self, key: str) -> bool:
        path = self._path(key)
        try:
            self._fs.rm_file(path)
            return True
        except (FileNotFoundError, KeyError):
            return False

    def exists(self, key: str) -> bool:
        return bool(self._fs.exists(self._path(key)))

"""Pluggable blob storage.

Defines the :class:`BlobStore` Protocol and a filesystem-backed
:class:`LocalBlobStore` that's the default for self-hosted single-node
deployments. ``S3BlobStore`` (boto3-backed) lives in :mod:`vellaris.server.storage_s3`.

Storage keys are opaque strings chosen by the caller. We validate them
against a strict charset to prevent path-traversal attacks (the caller
typically passes a UUID or a content-hash hex string — both fit).
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Protocol, runtime_checkable

# URL-safe-ish: letters, digits, hyphens, underscores, equals, slashes.
# Slashes are allowed so keys can include a single namespace prefix
# (e.g. "documents/abc123") but '..' is explicitly disallowed.
_KEY_RE = re.compile(r"^[A-Za-z0-9_\-=./]+$")


def validate_key(key: str) -> None:
    """Reject keys that could escape the blob root or be ambiguous."""
    if not isinstance(key, str):
        raise TypeError(f"key must be str, got {type(key).__name__}")
    if not key:
        raise ValueError("key must be non-empty")
    if not _KEY_RE.fullmatch(key):
        raise ValueError(f"key contains disallowed characters: {key!r}")
    if ".." in key.split("/"):
        raise ValueError(f"key contains '..' segment: {key!r}")
    if key.startswith("/") or key.startswith("."):
        raise ValueError(f"key must not start with '/' or '.': {key!r}")


@runtime_checkable
class BlobStore(Protocol):
    """The minimum surface every blob backend must implement."""

    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> bool: ...
    def exists(self, key: str) -> bool: ...


class BlobNotFound(KeyError):
    """Raised by :meth:`BlobStore.get` when the key is unknown."""


class LocalBlobStore:
    """Filesystem-backed blob store. Default for self-hosted deployments."""

    def __init__(self, root: str | os.PathLike[str]) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    @property
    def root(self) -> Path:
        return self._root

    def _path(self, key: str) -> Path:
        validate_key(key)
        # Resolve and verify the result still lives under root — defence in depth
        # in case validate_key misses some pathological input.
        path = (self._root / key).resolve()
        try:
            path.relative_to(self._root)
        except ValueError as exc:
            raise ValueError(f"key escapes blob root: {key!r}") from exc
        return path

    def put(self, key: str, data: bytes) -> None:
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError(f"data must be bytes, got {type(data).__name__}")
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write via temp + rename so partial writes don't leave a half-blob.
        tmp = path.with_suffix(path.suffix + ".tmp")
        with open(tmp, "wb") as f:
            f.write(bytes(data))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)

    def get(self, key: str) -> bytes:
        path = self._path(key)
        try:
            with open(path, "rb") as f:
                return f.read()
        except FileNotFoundError as exc:
            raise BlobNotFound(key) from exc

    def delete(self, key: str) -> bool:
        path = self._path(key)
        try:
            path.unlink()
            return True
        except FileNotFoundError:
            return False

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

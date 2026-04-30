"""Pluggable blob storage — Protocol + key validation.

Implementations live in ``storage_fsspec`` (fsspec-backed adapter that
covers local FS, S3, GCS, Azure, memory, etc.).
"""

from __future__ import annotations

import re
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

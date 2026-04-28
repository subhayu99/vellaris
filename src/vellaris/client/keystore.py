"""Local key store at ``~/.vellaris/keys/``.

Stores passphrase-wrapped private-key blobs as opaque bytes. The
wrapping happens at a higher layer (:mod:`vellaris.core.wrap`); this
module is only concerned with where the file lives and that its
permissions are owner-only.
"""

from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID

from vellaris.client.config import home_dir

KEYS_SUBDIR = "keys"
KEY_SUFFIX = ".key"


def keys_dir(root: Path | None = None) -> Path:
    """Resolve ``~/.vellaris/keys/`` (or under ``root`` if given)."""
    base = root if root is not None else home_dir()
    return base / KEYS_SUBDIR


class KeyStore:
    """Filesystem-backed wrapped-private-key store."""

    def __init__(self, root: Path | None = None) -> None:
        self._root = keys_dir(root)
        self._root.mkdir(parents=True, exist_ok=True, mode=0o700)

    @property
    def root(self) -> Path:
        return self._root

    def path_for(self, user_id: UUID) -> Path:
        return self._root / f"{user_id}{KEY_SUFFIX}"

    def has(self, user_id: UUID) -> bool:
        return self.path_for(user_id).is_file()

    def write_blob(self, user_id: UUID, blob: bytes) -> None:
        """Atomic write + chmod 0o600. Caller wraps the PEM via core.wrap."""
        if not isinstance(blob, (bytes, bytearray)):
            raise TypeError(f"blob must be bytes, got {type(blob).__name__}")
        path = self.path_for(user_id)
        tmp = path.with_suffix(path.suffix + ".tmp")
        with open(tmp, "wb") as f:
            f.write(bytes(blob))
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)

    def read_blob(self, user_id: UUID) -> bytes:
        """Read the wrapped blob. Raises FileNotFoundError if missing."""
        return self.path_for(user_id).read_bytes()

    def delete(self, user_id: UUID) -> bool:
        """Delete the key file. Returns True if it existed, False otherwise."""
        path = self.path_for(user_id)
        try:
            path.unlink()
            return True
        except FileNotFoundError:
            return False

    def list_users(self) -> list[UUID]:
        """Enumerate every user with a stored key blob."""
        out: list[UUID] = []
        for entry in self._root.iterdir():
            if entry.is_file() and entry.suffix == KEY_SUFFIX:
                try:
                    out.append(UUID(entry.stem))
                except ValueError:
                    continue
        return sorted(out, key=str)

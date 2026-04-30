"""Pick a BlobStore implementation based on settings."""

from __future__ import annotations

from functools import lru_cache

from vellaris.server.config import VellarisSettings, get_settings
from vellaris.server.storage import BlobStore
from vellaris.server.storage_fsspec import FsspecBlobStore


@lru_cache(maxsize=4)
def _store_for(blob_backend: str, blob_root: str) -> BlobStore:
    if blob_backend == "local":
        store: BlobStore = FsspecBlobStore(f"file://{blob_root}")
        return store
    if blob_backend == "s3":
        from vellaris.server.storage_s3 import S3BlobStore

        s3_store: BlobStore = S3BlobStore.from_settings(get_settings())
        return s3_store
    raise ValueError(f"unknown blob backend: {blob_backend}")


def get_blob_store(settings: VellarisSettings | None = None) -> BlobStore:
    s = settings or get_settings()
    return _store_for(s.blob_backend, str(s.blob_root))


def reset_blob_store_cache() -> None:
    _store_for.cache_clear()

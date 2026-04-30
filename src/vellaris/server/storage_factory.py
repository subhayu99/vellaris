"""Build the configured BlobStore from settings."""

from __future__ import annotations

from functools import lru_cache

from vellaris.server.config import VellarisSettings, get_settings
from vellaris.server.storage import BlobStore
from vellaris.server.storage_fsspec import FsspecBlobStore


@lru_cache(maxsize=4)
def _store_for(blob_url: str, blob_options_json: str | None) -> BlobStore:
    import json

    options = json.loads(blob_options_json) if blob_options_json else {}
    return FsspecBlobStore(blob_url, storage_options=options)


def get_blob_store(settings: VellarisSettings | None = None) -> BlobStore:
    s = settings or get_settings()
    return _store_for(s.blob_url, s.blob_options_json)


def reset_blob_store_cache() -> None:
    _store_for.cache_clear()

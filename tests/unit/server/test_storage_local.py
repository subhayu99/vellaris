"""LocalBlobStore round-trip + path-traversal rejection."""

from __future__ import annotations

from pathlib import Path

import pytest

from vellaris.server.storage import (
    BlobNotFound,
    BlobStore,
    LocalBlobStore,
    validate_key,
)


def test_local_blob_store_implements_protocol(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    assert isinstance(store, BlobStore)


def test_round_trip(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    store.put("documents/abc123", b"the quick brown fox")
    assert store.exists("documents/abc123")
    assert store.get("documents/abc123") == b"the quick brown fox"


def test_put_is_atomic_via_rename(tmp_path: Path) -> None:
    """No half-written .tmp files should be visible as the canonical key."""
    store = LocalBlobStore(tmp_path)
    store.put("a/b/c", b"data")
    files = sorted(p.name for p in tmp_path.rglob("*") if p.is_file())
    assert files == ["c"]


def test_overwrite(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    store.put("k", b"first")
    store.put("k", b"second")
    assert store.get("k") == b"second"


def test_delete_returns_true_when_present(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    store.put("k", b"x")
    assert store.delete("k") is True
    assert not store.exists("k")


def test_delete_returns_false_when_absent(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    assert store.delete("never-existed") is False


def test_get_unknown_raises_blob_not_found(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    with pytest.raises(BlobNotFound):
        store.get("missing")


def test_exists_false_when_absent(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    assert not store.exists("missing")


@pytest.mark.parametrize(
    "bad_key",
    [
        "",
        "/abs/path",
        "..",
        "../escape",
        "documents/../etc/passwd",
        ".hidden",
        "key with spaces",
        "key\nwith\nnewlines",
        "key\x00null",
        "key#hash",
    ],
)
def test_validate_key_rejects_bad_input(bad_key: str) -> None:
    with pytest.raises((ValueError, TypeError)):
        validate_key(bad_key)


def test_validate_key_rejects_non_str() -> None:
    with pytest.raises(TypeError):
        validate_key(b"bytes")  # type: ignore[arg-type]


def test_put_rejects_non_bytes(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    with pytest.raises(TypeError):
        store.put("k", "string-not-bytes")  # type: ignore[arg-type]


def test_put_rejects_traversal_via_validate(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    with pytest.raises(ValueError):
        store.put("../escape", b"x")


def test_root_directory_created(tmp_path: Path) -> None:
    nested = tmp_path / "deep" / "nested" / "blobs"
    LocalBlobStore(nested)
    assert nested.is_dir()

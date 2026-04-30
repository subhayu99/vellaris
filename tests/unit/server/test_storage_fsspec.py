"""FsspecBlobStore round-trips against memory:// and file:// backends."""

from __future__ import annotations

from pathlib import Path

import pytest

from vellaris.server.storage import BlobNotFound, BlobStore, validate_key
from vellaris.server.storage_fsspec import FsspecBlobStore


@pytest.fixture
def memory_store() -> FsspecBlobStore:
    # memory:// is per-process; isolate per test by using a unique prefix.
    import uuid

    return FsspecBlobStore(f"memory://test-{uuid.uuid4().hex}")


@pytest.fixture
def file_store(tmp_path: Path) -> FsspecBlobStore:
    return FsspecBlobStore(f"file://{tmp_path.as_posix()}")


@pytest.mark.parametrize("store_fixture", ["memory_store", "file_store"])
def test_implements_protocol(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store = request.getfixturevalue(store_fixture)
    assert isinstance(store, BlobStore)


@pytest.mark.parametrize("store_fixture", ["memory_store", "file_store"])
def test_round_trip(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store = request.getfixturevalue(store_fixture)
    store.put("documents/abc123", b"the quick brown fox")
    assert store.exists("documents/abc123")
    assert store.get("documents/abc123") == b"the quick brown fox"


@pytest.mark.parametrize("store_fixture", ["memory_store", "file_store"])
def test_overwrite(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store = request.getfixturevalue(store_fixture)
    store.put("k", b"first")
    store.put("k", b"second")
    assert store.get("k") == b"second"


@pytest.mark.parametrize("store_fixture", ["memory_store", "file_store"])
def test_delete_existing(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store = request.getfixturevalue(store_fixture)
    store.put("k", b"x")
    assert store.delete("k") is True
    assert not store.exists("k")


@pytest.mark.parametrize("store_fixture", ["memory_store", "file_store"])
def test_delete_missing(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store = request.getfixturevalue(store_fixture)
    assert store.delete("never-existed") is False


@pytest.mark.parametrize("store_fixture", ["memory_store", "file_store"])
def test_get_missing_raises(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store = request.getfixturevalue(store_fixture)
    with pytest.raises(BlobNotFound):
        store.get("missing")


@pytest.mark.parametrize("store_fixture", ["memory_store", "file_store"])
def test_put_rejects_non_bytes(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store = request.getfixturevalue(store_fixture)
    with pytest.raises(TypeError):
        store.put("k", "string-not-bytes")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "bad_key",
    ["", "/abs", "..", "../escape", "a/../b", ".hidden", "k\x00null"],
)
def test_validate_key_rejects_bad_input(bad_key: str) -> None:
    with pytest.raises((ValueError, TypeError)):
        validate_key(bad_key)


def test_file_store_resists_traversal(tmp_path: Path) -> None:
    store = FsspecBlobStore(f"file://{tmp_path.as_posix()}")
    with pytest.raises(ValueError):
        store.put("../escape", b"x")
    # Make sure nothing landed outside tmp_path.
    assert not (tmp_path.parent / "escape").exists()


def test_storage_options_passed_to_fs(tmp_path: Path) -> None:
    """auto_mkdir=True is the kind of option fsspec respects on file://."""
    store = FsspecBlobStore(
        f"file://{tmp_path.as_posix()}",
        storage_options={"auto_mkdir": True},
    )
    store.put("nested/dir/key", b"x")
    assert store.exists("nested/dir/key")

"""KeyStore IO + permission + roundtrip-with-wrap tests."""

from __future__ import annotations

import stat
from pathlib import Path
from uuid import uuid4

import pytest

from vellaris.client.keystore import KEY_SUFFIX, KeyStore, keys_dir
from vellaris.core.asymmetric import generate_keypair, serialize_private_key
from vellaris.core.kdf import Argon2Params
from vellaris.core.wrap import unwrap_private_key, wrap_private_key

CHEAP = Argon2Params(memory_cost_kib=8, time_cost=1, parallelism=1, key_length=32)


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VELLARIS_HOME", str(tmp_path / "vellaris"))


def test_keys_dir_under_home() -> None:
    assert keys_dir().name == "keys"


def test_init_creates_keys_dir() -> None:
    store = KeyStore()
    assert store.root.is_dir()


def test_write_then_read_blob() -> None:
    store = KeyStore()
    uid = uuid4()
    store.write_blob(uid, b"\x01wrapped-blob")
    assert store.has(uid)
    assert store.read_blob(uid) == b"\x01wrapped-blob"


def test_path_for_uses_uuid_filename() -> None:
    store = KeyStore()
    uid = uuid4()
    assert store.path_for(uid) == store.root / f"{uid}{KEY_SUFFIX}"


def test_write_overwrites() -> None:
    store = KeyStore()
    uid = uuid4()
    store.write_blob(uid, b"first")
    store.write_blob(uid, b"second")
    assert store.read_blob(uid) == b"second"


def test_blob_is_chmod_600() -> None:
    store = KeyStore()
    uid = uuid4()
    store.write_blob(uid, b"x")
    mode = store.path_for(uid).stat().st_mode & 0o777
    assert mode == 0o600


def test_keys_dir_owner_only() -> None:
    store = KeyStore()
    mode = store.root.stat().st_mode & 0o777
    assert not (mode & stat.S_IWGRP)
    assert not (mode & stat.S_IWOTH)


def test_delete_returns_true_when_present() -> None:
    store = KeyStore()
    uid = uuid4()
    store.write_blob(uid, b"x")
    assert store.delete(uid) is True
    assert not store.has(uid)


def test_delete_returns_false_when_absent() -> None:
    assert KeyStore().delete(uuid4()) is False


def test_list_users_finds_all_keys() -> None:
    store = KeyStore()
    uids = [uuid4() for _ in range(3)]
    for uid in uids:
        store.write_blob(uid, b"x")
    listed = store.list_users()
    assert sorted(listed, key=str) == sorted(uids, key=str)


def test_list_users_ignores_non_uuid_filenames() -> None:
    store = KeyStore()
    (store.root / f"not-a-uuid{KEY_SUFFIX}").write_bytes(b"x")
    (store.root / "some.txt").write_bytes(b"x")
    assert store.list_users() == []


def test_write_rejects_non_bytes() -> None:
    store = KeyStore()
    with pytest.raises(TypeError):
        store.write_blob(uuid4(), "string")  # type: ignore[arg-type]


def test_read_missing_raises_filenotfound() -> None:
    with pytest.raises(FileNotFoundError):
        KeyStore().read_blob(uuid4())


def test_round_trip_with_wrap() -> None:
    """Write a real wrapped key blob, read it back, and unwrap to the original PEM."""
    store = KeyStore()
    pem = serialize_private_key(generate_keypair().private_key)
    blob = wrap_private_key(pem, "passphrase!", params=CHEAP)
    uid = uuid4()
    store.write_blob(uid, blob)

    reloaded = unwrap_private_key(store.read_blob(uid), "passphrase!")
    assert reloaded == pem


def test_atomic_write_no_tmp_files() -> None:
    store = KeyStore()
    uid = uuid4()
    store.write_blob(uid, b"x")
    files = sorted(p.name for p in store.root.iterdir())
    assert files == [f"{uid}{KEY_SUFFIX}"]


def test_root_override_via_constructor(tmp_path: Path) -> None:
    """Constructor accepts a custom root, bypassing VELLARIS_HOME."""
    custom = tmp_path / "custom-vellaris"
    store = KeyStore(root=custom)
    uid = uuid4()
    store.write_blob(uid, b"y")
    assert store.path_for(uid).is_relative_to(custom)

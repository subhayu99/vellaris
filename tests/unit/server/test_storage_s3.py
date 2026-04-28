"""S3BlobStore tests via moto's mock S3."""

from __future__ import annotations

from collections.abc import Iterator

import boto3
import pytest
from moto import mock_aws

from vellaris.server.storage import BlobNotFound
from vellaris.server.storage_s3 import S3BlobStore

BUCKET = "vellaris-test"


@pytest.fixture
def s3_store() -> Iterator[S3BlobStore]:
    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket=BUCKET)
        yield S3BlobStore(bucket=BUCKET, region="us-east-1")


def test_round_trip(s3_store: S3BlobStore) -> None:
    s3_store.put("documents/abc", b"hello")
    assert s3_store.exists("documents/abc")
    assert s3_store.get("documents/abc") == b"hello"


def test_overwrite(s3_store: S3BlobStore) -> None:
    s3_store.put("k", b"first")
    s3_store.put("k", b"second")
    assert s3_store.get("k") == b"second"


def test_delete_existing(s3_store: S3BlobStore) -> None:
    s3_store.put("k", b"x")
    assert s3_store.delete("k") is True
    assert not s3_store.exists("k")


def test_delete_missing(s3_store: S3BlobStore) -> None:
    assert s3_store.delete("never-existed") is False


def test_get_missing_raises_blob_not_found(s3_store: S3BlobStore) -> None:
    with pytest.raises(BlobNotFound):
        s3_store.get("missing")


def test_exists_false_when_absent(s3_store: S3BlobStore) -> None:
    assert not s3_store.exists("missing")


def test_put_rejects_non_bytes(s3_store: S3BlobStore) -> None:
    with pytest.raises(TypeError):
        s3_store.put("k", "string-not-bytes")  # type: ignore[arg-type]


def test_invalid_key_rejected(s3_store: S3BlobStore) -> None:
    with pytest.raises(ValueError):
        s3_store.put("../escape", b"x")


def test_from_settings_requires_bucket() -> None:
    from vellaris.server.config import VellarisSettings

    s = VellarisSettings(_env_file=None, blob_backend="s3", s3_bucket=None)  # type: ignore[call-arg]
    with pytest.raises(ValueError, match="VELLARIS_S3_BUCKET"):
        S3BlobStore.from_settings(s)


def test_from_settings_builds_with_required_fields() -> None:
    from vellaris.server.config import VellarisSettings

    s = VellarisSettings(  # type: ignore[call-arg]
        _env_file=None,
        blob_backend="s3",
        s3_bucket="my-bucket",
        s3_region="us-east-1",
    )
    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="my-bucket")
        store = S3BlobStore.from_settings(s)
        store.put("k", b"v")
        assert store.get("k") == b"v"

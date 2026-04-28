"""S3-compatible blob store using boto3.

Works with AWS S3, MinIO, Cloudflare R2, Wasabi, etc. Endpoint URL +
region + bucket are configurable; credentials come from settings or
the standard boto3 chain.

boto3 is sync — async route handlers wrap calls in
``asyncio.to_thread``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from botocore.exceptions import ClientError

from vellaris.server.storage import BlobNotFound, validate_key

if TYPE_CHECKING:  # pragma: no cover
    from vellaris.server.config import VellarisSettings


class S3BlobStore:
    """boto3-backed implementation of :class:`vellaris.server.storage.BlobStore`."""

    def __init__(
        self,
        bucket: str,
        *,
        region: str | None = None,
        endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
    ) -> None:
        # Imported lazily so test code that never touches S3 doesn't pay for it.
        import boto3

        self._bucket = bucket
        self._client: Any = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )

    @classmethod
    def from_settings(cls, settings: VellarisSettings) -> S3BlobStore:
        if not settings.s3_bucket:
            raise ValueError("VELLARIS_S3_BUCKET must be set when blob_backend=s3")
        return cls(
            bucket=settings.s3_bucket,
            region=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
        )

    def put(self, key: str, data: bytes) -> None:
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError(f"data must be bytes, got {type(data).__name__}")
        validate_key(key)
        self._client.put_object(Bucket=self._bucket, Key=key, Body=bytes(data))

    def get(self, key: str) -> bytes:
        validate_key(key)
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise BlobNotFound(key) from exc
            raise
        return bytes(resp["Body"].read())

    def delete(self, key: str) -> bool:
        validate_key(key)
        # S3 delete is idempotent (returns 204 even for non-existent keys).
        # Use head_object first so the return value reflects "did it exist?".
        existed = self.exists(key)
        self._client.delete_object(Bucket=self._bucket, Key=key)
        return existed

    def exists(self, key: str) -> bool:
        validate_key(key)
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise
        return True

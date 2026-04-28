"""Upload-size cap + per-IP rate limit middleware.

Both are best-effort, in-process protections — they do NOT replace a
real WAF / reverse-proxy in production. The rate limiter uses a simple
token bucket keyed by client IP; restart wipes the buckets.
"""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from vellaris.server.config import VellarisSettings, get_settings


@dataclass
class _Bucket:
    tokens: float
    last_refill: float


class _RateLimiter:
    """Token bucket, refilled at ``rate / 60`` tokens per second up to ``burst``."""

    def __init__(self, *, rate_per_minute: int, burst: int) -> None:
        self._rate = rate_per_minute / 60.0
        self._burst = float(burst)
        self._buckets: dict[str, _Bucket] = defaultdict(
            lambda: _Bucket(tokens=self._burst, last_refill=time.monotonic())
        )

    def take(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._buckets[key]
        elapsed = now - bucket.last_refill
        bucket.tokens = min(self._burst, bucket.tokens + elapsed * self._rate)
        bucket.last_refill = now
        if bucket.tokens >= 1.0:
            bucket.tokens -= 1.0
            return True
        return False


def install(app: FastAPI) -> None:
    """Install the upload-size and rate-limit middleware on ``app``."""
    settings = get_settings()
    limiter = _RateLimiter(
        rate_per_minute=settings.rate_limit_per_minute,
        burst=settings.rate_limit_burst,
    )
    max_bytes = settings.max_upload_bytes

    @app.middleware("http")
    async def _enforce(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        return await _enforce_impl(request, call_next, limiter, max_bytes, settings)


async def _enforce_impl(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
    limiter: _RateLimiter,
    max_bytes: int,
    settings: VellarisSettings,
) -> Response:
    # Health checks bypass everything so probes don't get throttled.
    if request.url.path in {"/healthz", "/openapi.json", "/docs", "/redoc"}:
        return await call_next(request)

    # Upload-size cap based on the declared Content-Length. Streaming uploads
    # without a Content-Length will pass this check; FastAPI's body parsing
    # will hit its own configured limit before memory blows up.
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            length = int(declared)
        except ValueError:
            length = 0
        if length > max_bytes:
            return JSONResponse(
                status_code=413,
                content={"detail": (f"request body too large: {length} bytes (max {max_bytes})")},
            )

    # Rate limit per client IP.
    client = request.client.host if request.client else "unknown"
    if not limiter.take(client):
        return JSONResponse(
            status_code=429,
            content={"detail": (f"rate limit exceeded ({settings.rate_limit_per_minute}/min)")},
        )

    return await call_next(request)


__all__ = ["install"]


# starlette type stubs aren't loaded; reference ASGIApp so the unused import
# doesn't trip the linter (we keep it imported for type clarity in install()).
_ = ASGIApp

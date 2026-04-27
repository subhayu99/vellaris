"""FastAPI application entry point for `vellaris-server`."""

from __future__ import annotations

from fastapi import FastAPI

from vellaris import __version__

app = FastAPI(
    title="Vellaris",
    description="End-to-end encrypted document sharing — server.",
    version=__version__,
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness probe. Returns 200 with a fixed payload."""
    return {"status": "ok"}

"""FastAPI application entry point for `vellaris-server`."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from vellaris import __version__
from vellaris.server.config import get_settings
from vellaris.server.routes import auth as auth_routes
from vellaris.server.routes import users as users_routes


def create_app() -> FastAPI:
    """Build a fresh FastAPI app. Tests use this to avoid module-level state."""
    settings = get_settings()
    application = FastAPI(
        title="Vellaris",
        description="End-to-end encrypted document sharing — server.",
        version=__version__,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/healthz", tags=["meta"])
    def healthz() -> dict[str, str]:
        """Liveness probe. Returns 200 with a fixed payload."""
        return {"status": "ok"}

    application.include_router(auth_routes.router)
    application.include_router(users_routes.router)
    return application


app = create_app()

"""FastAPI application entry point for `vellaris-server`."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from vellaris import __version__
from vellaris.server import limits
from vellaris.server.config import get_settings
from vellaris.server.routes import auth as auth_routes
from vellaris.server.routes import documents as documents_routes
from vellaris.server.routes import keyblobs as keyblobs_routes
from vellaris.server.routes import notifications as notifications_routes
from vellaris.server.routes import users as users_routes
from vellaris.server.routes import webauthn as webauthn_routes


def create_app() -> FastAPI:
    """Build a fresh FastAPI app. Tests use this to avoid module-level state."""
    settings = get_settings()
    application = FastAPI(
        title="Vellaris",
        description="End-to-end encrypted document sharing — server.",
        version=__version__,
    )

    @application.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        """Liveness probe. Returns 200 with a fixed payload."""
        return {"status": "ok"}

    limits.install(application)
    application.include_router(auth_routes.router)
    application.include_router(users_routes.router)
    application.include_router(documents_routes.router)
    application.include_router(keyblobs_routes.router)
    application.include_router(webauthn_routes.router)
    application.include_router(notifications_routes.router)

    # CORS is installed LAST so it's the outermost middleware. Starlette
    # composes middleware most-recently-added = outermost, so a 429 from
    # the rate limiter (which short-circuits before call_next) still flows
    # back through CORS on the way out and gets its Access-Control-Allow-*
    # headers — without that the browser surfaces "rate limit exceeded"
    # 429s as opaque CORS errors.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return application


app = create_app()

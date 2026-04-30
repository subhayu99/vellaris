"""Console-script entry points for the Vellaris server.

`vellaris-server`         — run uvicorn (with optional auto-migrate first).
`vellaris-server migrate` — run alembic upgrade head and exit.
"""

from __future__ import annotations

import sys

import uvicorn

from vellaris.server._drivers import check_async_driver
from vellaris.server.config import get_settings


def _check_drivers() -> None:
    settings = get_settings()
    check_async_driver(settings.database_url)


def main() -> None:
    """Run the FastAPI app under uvicorn, optionally running migrations first."""
    if len(sys.argv) >= 2 and sys.argv[1] == "migrate":
        _check_drivers()
        from vellaris.server._migrate import upgrade_to_head

        upgrade_to_head()
        return

    settings = get_settings()
    _check_drivers()
    if settings.auto_migrate:
        from vellaris.server._migrate import upgrade_to_head

        upgrade_to_head()
    uvicorn.run(
        "vellaris.server.app:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":  # pragma: no cover
    main()

"""Detect whether the configured DB URL's async driver is importable.

Fail fast at startup with a clear install hint instead of letting an
opaque ``ModuleNotFoundError`` surface 200 lines deep in a stack trace.
"""

from __future__ import annotations

import importlib.util


class DriverNotInstalledError(RuntimeError):
    """Raised when the configured DATABASE_URL needs a driver that isn't installed."""


# Map SQLAlchemy dialect+driver → (importable module, vellaris extra name)
_DRIVER_MAP: dict[str, tuple[str, str]] = {
    "sqlite+aiosqlite": ("aiosqlite", "sqlite"),
    "postgresql+asyncpg": ("asyncpg", "postgres"),
    "postgresql+psycopg": ("psycopg", "postgres"),  # legacy users
    "mysql+asyncmy": ("asyncmy", "mysql"),
    "mariadb+asyncmy": ("asyncmy", "mysql"),
}


def driver_for_url(url: str) -> tuple[str, str]:
    """Return ``(module_name, extra_name)`` for ``url``.

    Raises ``ValueError`` if the dialect+driver combination isn't one we
    know how to package. Users can still install third-party drivers
    themselves; this helper only knows about the ones we support.
    """
    # Take everything before the first "://".
    scheme = url.split("://", 1)[0]
    if scheme not in _DRIVER_MAP:
        known = ", ".join(sorted(_DRIVER_MAP))
        raise ValueError(
            f"cannot infer async driver from URL scheme {scheme!r}; "
            f"supported: {known}"
        )
    return _DRIVER_MAP[scheme]


def check_async_driver(url: str) -> None:
    """Raise ``DriverNotInstalledError`` if the URL's driver isn't importable."""
    module, extra = driver_for_url(url)
    spec = importlib.util.find_spec(module)
    if spec is None:
        raise DriverNotInstalledError(
            f"VELLARIS_DATABASE_URL={url!r} requires the {module!r} package.\n"
            f"  pip:    pip install 'vellaris[{extra}]'\n"
            f"  docker: pull ghcr.io/subhayu99/vellaris:0.5.0-full "
            f"(or build a custom slim+{extra} image — see /docs/install)"
        )

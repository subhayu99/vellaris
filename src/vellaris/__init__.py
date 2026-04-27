"""Vellaris — end-to-end encrypted document sharing you self-host."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("vellaris")
except PackageNotFoundError:  # pragma: no cover - package not installed
    __version__ = "0.0.0"

__all__ = ["__version__"]

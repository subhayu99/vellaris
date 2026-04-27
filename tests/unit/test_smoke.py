"""Smoke tests — the package imports and exposes its version."""

from __future__ import annotations


def test_imports_work() -> None:
    """The top-level package imports and `__version__` is a non-empty string."""
    import vellaris

    assert isinstance(vellaris.__version__, str)
    assert vellaris.__version__

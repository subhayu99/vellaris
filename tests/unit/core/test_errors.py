"""Errors form a single-rooted hierarchy under `VellarisCryptoError`."""

from __future__ import annotations

import pytest

from vellaris.core.errors import (
    DecryptError,
    KdfError,
    KeyFormatError,
    SignatureError,
    VellarisCryptoError,
    WireFormatError,
)


@pytest.mark.parametrize(
    "exc",
    [DecryptError, SignatureError, KdfError, WireFormatError, KeyFormatError],
)
def test_subclasses_inherit_from_base(exc: type[Exception]) -> None:
    assert issubclass(exc, VellarisCryptoError)
    assert issubclass(exc, Exception)


def test_base_can_be_caught_for_any_subclass() -> None:
    for exc in (DecryptError, SignatureError, KdfError, WireFormatError, KeyFormatError):
        with pytest.raises(VellarisCryptoError):
            raise exc("nope")

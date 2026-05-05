"""VAPID key helpers + the ``vellaris-server generate-vapid-key`` CLI."""

from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from vellaris.server.config import reset_settings_cache
from vellaris.server.push import (
    _b64url_nopad,
    _deserialize_private_raw,
    _public_uncompressed,
    _serialize_private_raw,
    generate_vapid_key_pair,
    get_vapid_private_key,
    get_vapid_public_key_b64url,
    reset_vapid_key_cache,
    vapid_public_key_b64url,
)


def test_b64url_nopad_strips_padding() -> None:
    assert _b64url_nopad(b"\x00") == "AA"
    # Standard base64 of 4 bytes is 6 chars (no padding); base64url just
    # swaps the alphabet — content is the same.
    assert _b64url_nopad(b"\x01\x02\x03\x04") == "AQIDBA"


def test_serialize_private_raw_round_trip() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    raw = _serialize_private_raw(key)
    assert len(raw) == 32
    restored = _deserialize_private_raw(raw)
    assert _public_uncompressed(restored) == _public_uncompressed(key)


def test_deserialize_private_raw_rejects_wrong_length() -> None:
    with pytest.raises(ValueError):
        _deserialize_private_raw(b"\x01" * 31)
    with pytest.raises(ValueError):
        _deserialize_private_raw(b"")


def test_public_uncompressed_is_65_bytes() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    pub = _public_uncompressed(key)
    assert len(pub) == 65
    assert pub[0] == 0x04  # uncompressed point marker


def test_generate_vapid_key_pair_consistency() -> None:
    private, public = generate_vapid_key_pair()
    assert len(private) == 32
    # Re-derive and confirm it matches.
    derived = vapid_public_key_b64url(_deserialize_private_raw(private))
    assert derived == public


def test_get_vapid_private_key_returns_none_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VELLARIS_VAPID_PRIVATE_KEY_PATH", raising=False)
    reset_settings_cache()
    reset_vapid_key_cache()
    assert get_vapid_private_key() is None
    assert get_vapid_public_key_b64url() is None


def test_get_vapid_private_key_loads_from_disk(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    private, public = generate_vapid_key_pair()
    key_path = tmp_path / "vapid.key"
    key_path.write_bytes(private)
    monkeypatch.setenv("VELLARIS_VAPID_PRIVATE_KEY_PATH", str(key_path))
    reset_settings_cache()
    reset_vapid_key_cache()

    loaded = get_vapid_private_key()
    assert loaded is not None
    assert get_vapid_public_key_b64url() == public


def test_get_vapid_private_key_caches_load(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Repeated calls don't re-read the file (cache keyed on path)."""
    private, _ = generate_vapid_key_pair()
    key_path = tmp_path / "vapid.key"
    key_path.write_bytes(private)
    monkeypatch.setenv("VELLARIS_VAPID_PRIVATE_KEY_PATH", str(key_path))
    reset_settings_cache()
    reset_vapid_key_cache()

    first = get_vapid_private_key()
    # Mutate the file underneath. Cache means we still see the original.
    key_path.write_bytes(b"\x00" * 32)
    second = get_vapid_private_key()
    assert first is second  # exact object identity


# ---------- CLI ----------


def test_generate_vapid_key_cli_writes_32_bytes_and_emits_setup_hints(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Run the CLI with sys.argv stubbed; capture stdout (binary) + stderr (hints)."""
    from vellaris.server import cli as cli_module

    out_buf = io.BytesIO()
    err_buf = io.StringIO()

    class _StdoutShim:
        buffer = out_buf

        @staticmethod
        def write(_text: str) -> None:
            return None

        @staticmethod
        def flush() -> None:
            return None

    monkeypatch.setattr(sys, "argv", ["vellaris-server", "generate-vapid-key"])
    monkeypatch.setattr(sys, "stdout", _StdoutShim)
    monkeypatch.setattr(sys, "stderr", err_buf)

    cli_module.main()

    raw = out_buf.getvalue()
    assert len(raw) == 32

    err = err_buf.getvalue()
    assert "raw P-256 private key" in err
    assert "VELLARIS_VAPID_PRIVATE_KEY_PATH" in err
    # The public key block should round-trip back to the private bytes.
    pub_line = next(line for line in err.splitlines() if "Public key" in line)
    pub_b64 = pub_line.split(":", 1)[1].strip()
    pad = "=" * (-len(pub_b64) % 4)
    decoded = base64.urlsafe_b64decode(pub_b64 + pad)
    assert len(decoded) == 65 and decoded[0] == 0x04

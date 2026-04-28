"""Versioned ciphertext envelope: pack/unpack round-trip + rejection cases."""

from __future__ import annotations

import pytest

from vellaris.core.errors import DecryptError, WireFormatError
from vellaris.core.symmetric import (
    NONCE_SIZE,
    TAG_SIZE,
    GcmCiphertext,
    decrypt,
    encrypt,
    random_key,
)
from vellaris.core.wire import CIPHERTEXT_V1, pack, unpack


def _sealed() -> tuple[bytes, GcmCiphertext]:
    key = random_key()
    return key, encrypt(b"the quick brown fox", key)


def test_round_trip() -> None:
    key, sealed = _sealed()
    blob = pack(sealed)
    assert blob[0] == CIPHERTEXT_V1
    assert len(blob) == 1 + NONCE_SIZE + TAG_SIZE + len(sealed.ciphertext)
    assert decrypt(unpack(blob), key) == b"the quick brown fox"


def test_unpack_recovers_components_exactly() -> None:
    _, sealed = _sealed()
    parsed = unpack(pack(sealed))
    assert parsed.nonce == sealed.nonce
    assert parsed.tag == sealed.tag
    assert parsed.ciphertext == sealed.ciphertext


def test_pack_rejects_unknown_version() -> None:
    _, sealed = _sealed()
    with pytest.raises(WireFormatError, match="unknown ciphertext version"):
        pack(sealed, version=0x02)


def test_pack_rejects_short_nonce() -> None:
    bad = GcmCiphertext(nonce=b"\x00" * 6, tag=b"\x00" * TAG_SIZE, ciphertext=b"x")
    with pytest.raises(WireFormatError, match="nonce"):
        pack(bad)


def test_pack_rejects_short_tag() -> None:
    bad = GcmCiphertext(nonce=b"\x00" * NONCE_SIZE, tag=b"\x00" * 4, ciphertext=b"x")
    with pytest.raises(WireFormatError, match="tag"):
        pack(bad)


def test_unpack_rejects_short_blob() -> None:
    with pytest.raises(WireFormatError, match="too short"):
        unpack(b"\x01" + b"\x00" * 5)


def test_unpack_rejects_empty_blob() -> None:
    with pytest.raises(WireFormatError, match="too short"):
        unpack(b"")


def test_unpack_rejects_unknown_version() -> None:
    blob = b"\x99" + b"\x00" * (NONCE_SIZE + TAG_SIZE) + b"payload"
    with pytest.raises(WireFormatError, match="unknown ciphertext version"):
        unpack(blob)


def test_unpack_rejects_non_bytes() -> None:
    with pytest.raises(WireFormatError, match="must be bytes"):
        unpack("string")  # type: ignore[arg-type]


def test_unpack_accepts_zero_length_ciphertext() -> None:
    """Encrypting an empty plaintext is valid; the wire envelope must round-trip it."""
    key = random_key()
    sealed = encrypt(b"", key)
    parsed = unpack(pack(sealed))
    assert parsed.ciphertext == b""
    assert decrypt(parsed, key) == b""


def test_tampering_detected_at_decrypt_not_unpack() -> None:
    """unpack() trusts the inner bytes; tag verification happens at decrypt()."""
    key, sealed = _sealed()
    blob = bytearray(pack(sealed))
    # Flip a byte in the ciphertext region.
    blob[1 + NONCE_SIZE + TAG_SIZE] ^= 0x01
    parsed = unpack(bytes(blob))  # accepts (structure is intact)
    with pytest.raises(DecryptError):
        decrypt(parsed, key)

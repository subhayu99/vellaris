"""Passphrase-wrapped private-key blob round-trip and rejection tests."""

from __future__ import annotations

import struct

import pytest

from vellaris.core.asymmetric import generate_keypair, serialize_private_key
from vellaris.core.errors import DecryptError, KdfError, WireFormatError
from vellaris.core.kdf import SALT_SIZE, Argon2Params
from vellaris.core.wrap import (
    WRAPPED_V1,
    is_wrapped_blob,
    unwrap_private_key,
    wrap_private_key,
)

# Cheap KDF params keep the suite fast — see test_kdf.py for the full param-sensitivity coverage.
CHEAP = Argon2Params(memory_cost_kib=8, time_cost=1, parallelism=1, key_length=32)


@pytest.fixture(scope="module")
def pem() -> bytes:
    return serialize_private_key(generate_keypair().private_key)


def test_wrap_unwrap_round_trip(pem: bytes) -> None:
    blob = wrap_private_key(pem, "correct horse battery staple", params=CHEAP)
    assert blob[0] == WRAPPED_V1
    assert is_wrapped_blob(blob)
    assert unwrap_private_key(blob, "correct horse battery staple") == pem


def test_str_and_bytes_passphrase_equivalent(pem: bytes) -> None:
    """A unicode passphrase is UTF-8-encoded, so str and the matching bytes form should round-trip identically."""
    blob = wrap_private_key(pem, "café-rouge", params=CHEAP)
    assert unwrap_private_key(blob, "café-rouge".encode()) == pem


def test_distinct_blobs_for_same_input(pem: bytes) -> None:
    """Each wrap uses a fresh random salt and nonce; the blob must differ."""
    a = wrap_private_key(pem, "x", params=CHEAP)
    b = wrap_private_key(pem, "x", params=CHEAP)
    assert a != b


def test_wrong_passphrase_rejected(pem: bytes) -> None:
    blob = wrap_private_key(pem, "right", params=CHEAP)
    with pytest.raises(DecryptError):
        unwrap_private_key(blob, "wrong")


def test_tampered_ciphertext_rejected(pem: bytes) -> None:
    blob = bytearray(wrap_private_key(pem, "x", params=CHEAP))
    # Flip a byte in the inner ciphertext (last quarter of the blob).
    blob[-10] ^= 0x01
    with pytest.raises(DecryptError):
        unwrap_private_key(bytes(blob), "x")


def test_tampered_salt_rejected(pem: bytes) -> None:
    """Mutating the salt invalidates both the derived key AND the AEAD's AAD."""
    blob = bytearray(wrap_private_key(pem, "x", params=CHEAP))
    blob[1] ^= 0x01  # first salt byte
    with pytest.raises(DecryptError):
        unwrap_private_key(bytes(blob), "x")


def test_tampered_params_rejected(pem: bytes) -> None:
    """The params JSON is bound to the AEAD via AAD; changing it must fail decryption."""
    blob = bytearray(wrap_private_key(pem, "x", params=CHEAP))
    # Walk into the params region and flip a byte. Header is 1 + SALT_SIZE + 2.
    params_offset = 1 + SALT_SIZE + 2
    blob[params_offset] ^= 0x01
    # Likely produces a malformed JSON (WireFormatError) OR a valid JSON
    # whose params don't match (DecryptError). Either is acceptable.
    with pytest.raises((WireFormatError, DecryptError, KdfError)):
        unwrap_private_key(bytes(blob), "x")


def test_unknown_version_rejected() -> None:
    blob = bytes([0x99]) + b"\x00" * (SALT_SIZE + 2)
    with pytest.raises(WireFormatError, match="unknown wrapped-key version"):
        unwrap_private_key(blob, "x")


def test_short_blob_rejected() -> None:
    with pytest.raises(WireFormatError, match="too short"):
        unwrap_private_key(b"\x01\x00", "x")


def test_truncated_params_rejected() -> None:
    """Header claims 100 bytes of params but blob ends sooner."""
    blob = bytes([WRAPPED_V1]) + b"\x00" * SALT_SIZE + struct.pack(">H", 100) + b"only-five"
    with pytest.raises(WireFormatError, match="truncated"):
        unwrap_private_key(blob, "x")


def test_malformed_params_json_rejected() -> None:
    """Build a structurally-valid header with garbage in the params region."""
    bad_json = b"\xff\xfe\xfd\xfc"  # not valid UTF-8 / not valid JSON
    blob = (
        bytes([WRAPPED_V1])
        + b"\x00" * SALT_SIZE
        + struct.pack(">H", len(bad_json))
        + bad_json
        + b"\x01"
        + b"\x00" * (12 + 16)  # wire-pack header for empty ciphertext
    )
    with pytest.raises(WireFormatError, match="malformed params JSON"):
        unwrap_private_key(blob, "x")


def test_unwrap_rejects_non_bytes() -> None:
    with pytest.raises(WireFormatError, match="must be bytes"):
        unwrap_private_key("string", "x")  # type: ignore[arg-type]


def test_wrap_rejects_non_bytes_pem(pem: bytes) -> None:
    with pytest.raises(TypeError):
        wrap_private_key("not-bytes", "x", params=CHEAP)  # type: ignore[arg-type]


def test_is_wrapped_blob() -> None:
    assert is_wrapped_blob(b"\x01rest")
    assert not is_wrapped_blob(b"\x02rest")
    assert not is_wrapped_blob(b"")

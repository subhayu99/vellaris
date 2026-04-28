"""Ed25519 sign/verify round-trip + tampering."""

from __future__ import annotations

import pytest

from vellaris.core.errors import KeyFormatError, SignatureError
from vellaris.core.signing import (
    PRIVATE_KEY_SIZE,
    PUBLIC_KEY_SIZE,
    SIGNATURE_SIZE,
    deserialize_private_key,
    deserialize_public_key,
    generate_keypair,
    serialize_private_key,
    serialize_public_key,
    sign,
    verify,
)


def test_generate_keypair_sizes() -> None:
    kp = generate_keypair()
    assert len(serialize_private_key(kp.private_key)) == PRIVATE_KEY_SIZE
    assert len(serialize_public_key(kp.public_key)) == PUBLIC_KEY_SIZE


def test_round_trip() -> None:
    kp = generate_keypair()
    sig = sign(b"audit:user_login user_id=42 ts=1714000000", kp.private_key)
    assert len(sig) == SIGNATURE_SIZE
    verify(b"audit:user_login user_id=42 ts=1714000000", sig, kp.public_key)  # raises on failure


def test_signature_is_deterministic_per_key_and_message() -> None:
    """Ed25519 is deterministic — same (key, msg) produces same signature."""
    kp = generate_keypair()
    a = sign(b"x", kp.private_key)
    b = sign(b"x", kp.private_key)
    assert a == b


def test_serialize_round_trip_keeps_signing_behavior() -> None:
    """Serializing and reloading keys preserves their identity."""
    kp = generate_keypair()
    raw_priv = serialize_private_key(kp.private_key)
    raw_pub = serialize_public_key(kp.public_key)

    priv2 = deserialize_private_key(raw_priv)
    pub2 = deserialize_public_key(raw_pub)

    msg = b"hello"
    sig_orig = sign(msg, kp.private_key)
    sig_reloaded = sign(msg, priv2)
    assert sig_orig == sig_reloaded
    verify(msg, sig_reloaded, pub2)


def test_tampered_message_rejected() -> None:
    kp = generate_keypair()
    sig = sign(b"original", kp.private_key)
    with pytest.raises(SignatureError):
        verify(b"tampered", sig, kp.public_key)


def test_tampered_signature_rejected() -> None:
    kp = generate_keypair()
    sig = bytearray(sign(b"original", kp.private_key))
    sig[0] ^= 0x01
    with pytest.raises(SignatureError):
        verify(b"original", bytes(sig), kp.public_key)


def test_wrong_key_rejected() -> None:
    a = generate_keypair()
    b = generate_keypair()
    sig = sign(b"signed by a", a.private_key)
    with pytest.raises(SignatureError):
        verify(b"signed by a", sig, b.public_key)


@pytest.mark.parametrize("bad_len", [0, 1, 16, 31, 33, 64])
def test_deserialize_private_rejects_wrong_length(bad_len: int) -> None:
    with pytest.raises(KeyFormatError, match=str(PRIVATE_KEY_SIZE)):
        deserialize_private_key(b"\x00" * bad_len)


@pytest.mark.parametrize("bad_len", [0, 1, 16, 31, 33, 64])
def test_deserialize_public_rejects_wrong_length(bad_len: int) -> None:
    with pytest.raises(KeyFormatError, match=str(PUBLIC_KEY_SIZE)):
        deserialize_public_key(b"\x00" * bad_len)


def test_deserialize_private_rejects_non_bytes() -> None:
    with pytest.raises(KeyFormatError, match="must be bytes"):
        deserialize_private_key("string")  # type: ignore[arg-type]


def test_deserialize_public_rejects_non_bytes() -> None:
    with pytest.raises(KeyFormatError, match="must be bytes"):
        deserialize_public_key("string")  # type: ignore[arg-type]

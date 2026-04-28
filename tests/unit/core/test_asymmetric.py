"""RSA-4096 OAEP + PSS round-trips, tampering, malformed-key rejection."""

from __future__ import annotations

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from vellaris.core.asymmetric import (
    KEY_SIZE_BITS,
    PUBLIC_EXPONENT,
    deserialize_private_key,
    deserialize_public_key,
    generate_keypair,
    oaep_decrypt,
    oaep_encrypt,
    pss_sign,
    pss_verify,
    serialize_private_key,
    serialize_public_key,
)
from vellaris.core.errors import DecryptError, KeyFormatError, SignatureError

# Generating an RSA-4096 keypair takes ~0.5-1s on a modern laptop, so we
# cache it across all tests in this module.


@pytest.fixture(scope="module")
def keypair():  # type: ignore[no-untyped-def]
    return generate_keypair()


@pytest.fixture(scope="module")
def other_keypair():  # type: ignore[no-untyped-def]
    return generate_keypair()


def test_keypair_size(keypair) -> None:  # type: ignore[no-untyped-def]
    assert keypair.private_key.key_size == KEY_SIZE_BITS
    assert keypair.public_key.key_size == KEY_SIZE_BITS
    assert keypair.private_key.public_key().public_numbers() == keypair.public_key.public_numbers()


def test_public_exponent_is_65537(keypair) -> None:  # type: ignore[no-untyped-def]
    assert keypair.public_key.public_numbers().e == PUBLIC_EXPONENT


def test_pem_round_trip_private(keypair) -> None:  # type: ignore[no-untyped-def]
    pem = serialize_private_key(keypair.private_key)
    assert pem.startswith(b"-----BEGIN PRIVATE KEY-----")
    loaded = deserialize_private_key(pem)
    assert loaded.private_numbers() == keypair.private_key.private_numbers()


def test_pem_round_trip_public(keypair) -> None:  # type: ignore[no-untyped-def]
    pem = serialize_public_key(keypair.public_key)
    assert pem.startswith(b"-----BEGIN PUBLIC KEY-----")
    loaded = deserialize_public_key(pem)
    assert loaded.public_numbers() == keypair.public_key.public_numbers()


def test_oaep_round_trip(keypair) -> None:  # type: ignore[no-untyped-def]
    plaintext = b"\x00" * 32  # the typical payload: a 32-byte AES-256 DEK
    assert len(plaintext) == 32
    ct = oaep_encrypt(plaintext, keypair.public_key)
    assert ct != plaintext
    # RSA-4096 ciphertexts are 512 bytes regardless of plaintext length.
    assert len(ct) == 512
    assert oaep_decrypt(ct, keypair.private_key) == plaintext


def test_oaep_distinct_ciphertexts_for_same_plaintext(keypair) -> None:  # type: ignore[no-untyped-def]
    pt = b"deterministic input"
    a = oaep_encrypt(pt, keypair.public_key)
    b = oaep_encrypt(pt, keypair.public_key)
    assert a != b  # OAEP randomizes


def test_oaep_wrong_key_rejected(keypair, other_keypair) -> None:  # type: ignore[no-untyped-def]
    ct = oaep_encrypt(b"secret", keypair.public_key)
    with pytest.raises(DecryptError):
        oaep_decrypt(ct, other_keypair.private_key)


def test_oaep_tampered_ciphertext_rejected(keypair) -> None:  # type: ignore[no-untyped-def]
    ct = bytearray(oaep_encrypt(b"secret", keypair.public_key))
    ct[0] ^= 0x01
    with pytest.raises(DecryptError):
        oaep_decrypt(bytes(ct), keypair.private_key)


def test_pss_round_trip(keypair) -> None:  # type: ignore[no-untyped-def]
    msg = b"challenge:8a7d3f1c|session:abc123|ts:1714000000"
    sig = pss_sign(msg, keypair.private_key)
    # PSS over a 4096-bit key produces a 512-byte signature.
    assert len(sig) == 512
    pss_verify(msg, sig, keypair.public_key)  # raises on failure


def test_pss_distinct_signatures_for_same_message(keypair) -> None:  # type: ignore[no-untyped-def]
    msg = b"same message"
    a = pss_sign(msg, keypair.private_key)
    b = pss_sign(msg, keypair.private_key)
    assert a != b  # PSS is randomized via salt


def test_pss_tampered_message_rejected(keypair) -> None:  # type: ignore[no-untyped-def]
    msg = b"original message"
    sig = pss_sign(msg, keypair.private_key)
    with pytest.raises(SignatureError):
        pss_verify(b"tampered message", sig, keypair.public_key)


def test_pss_wrong_key_rejected(keypair, other_keypair) -> None:  # type: ignore[no-untyped-def]
    msg = b"who signed this?"
    sig = pss_sign(msg, keypair.private_key)
    with pytest.raises(SignatureError):
        pss_verify(msg, sig, other_keypair.public_key)


def test_pss_truncated_signature_rejected(keypair) -> None:  # type: ignore[no-untyped-def]
    msg = b"hi"
    sig = pss_sign(msg, keypair.private_key)
    with pytest.raises(SignatureError):
        pss_verify(msg, sig[:-1], keypair.public_key)


def test_oaep_signature_does_not_double_as_pss(keypair) -> None:  # type: ignore[no-untyped-def]
    """The original PoC reused OAEP padding for signing; PSS must reject it.

    Encrypting a message with OAEP and then trying to verify the resulting
    bytes as a PSS signature should fail. This guards against accidentally
    re-introducing the bug where signing reused get_padding() / OAEP.
    """
    msg = b"x"
    not_a_signature = oaep_encrypt(msg, keypair.public_key)
    with pytest.raises(SignatureError):
        pss_verify(msg, not_a_signature, keypair.public_key)


def test_deserialize_private_rejects_garbage() -> None:
    with pytest.raises(KeyFormatError, match="failed to load private key"):
        deserialize_private_key(b"not a PEM")


def test_deserialize_public_rejects_garbage() -> None:
    with pytest.raises(KeyFormatError, match="failed to load public key"):
        deserialize_public_key(b"not a PEM")


def test_deserialize_private_rejects_non_bytes() -> None:
    with pytest.raises(KeyFormatError, match="must be bytes"):
        deserialize_private_key("string-not-bytes")  # type: ignore[arg-type]


def test_deserialize_public_rejects_non_bytes() -> None:
    with pytest.raises(KeyFormatError, match="must be bytes"):
        deserialize_public_key("string-not-bytes")  # type: ignore[arg-type]


def test_deserialize_private_rejects_non_rsa_key() -> None:
    """An EC key serialized as PEM should be rejected by load+type-check."""
    ec_priv = ec.generate_private_key(ec.SECP256R1())
    pem = ec_priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with pytest.raises(KeyFormatError, match="expected an RSA"):
        deserialize_private_key(pem)


def test_deserialize_public_rejects_non_rsa_key() -> None:
    ec_pub = ec.generate_private_key(ec.SECP256R1()).public_key()
    pem = ec_pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    with pytest.raises(KeyFormatError, match="expected an RSA"):
        deserialize_public_key(pem)

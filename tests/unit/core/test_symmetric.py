"""AES-256-GCM round-trips, tampering, key validation."""

from __future__ import annotations

import pytest

from vellaris.core.errors import DecryptError
from vellaris.core.symmetric import (
    KEY_SIZE,
    NONCE_SIZE,
    TAG_SIZE,
    GcmCiphertext,
    decrypt,
    encrypt,
    random_key,
)


def test_random_key_returns_32_bytes() -> None:
    k = random_key()
    assert isinstance(k, bytes)
    assert len(k) == KEY_SIZE


def test_random_key_is_not_constant() -> None:
    assert random_key() != random_key()


@pytest.mark.parametrize("size", [0, 1, 31, 64, 1024, 1024 * 1024])
def test_round_trip(size: int) -> None:
    key = random_key()
    plaintext = b"x" * size
    sealed = encrypt(plaintext, key)
    assert isinstance(sealed, GcmCiphertext)
    assert len(sealed.nonce) == NONCE_SIZE
    assert len(sealed.tag) == TAG_SIZE
    assert len(sealed.ciphertext) == size  # GCM is a stream cipher
    assert decrypt(sealed, key) == plaintext


def test_distinct_nonces_per_call() -> None:
    key = random_key()
    a = encrypt(b"same", key)
    b = encrypt(b"same", key)
    assert a.nonce != b.nonce
    assert a.ciphertext != b.ciphertext


def test_associated_data_round_trip() -> None:
    key = random_key()
    sealed = encrypt(b"payload", key, associated_data=b"context-v1")
    assert decrypt(sealed, key, associated_data=b"context-v1") == b"payload"


def test_associated_data_mismatch_rejected() -> None:
    key = random_key()
    sealed = encrypt(b"payload", key, associated_data=b"context-v1")
    with pytest.raises(DecryptError, match="tag verification failed"):
        decrypt(sealed, key, associated_data=b"context-v2")


def test_wrong_key_rejected() -> None:
    sealed = encrypt(b"payload", random_key())
    with pytest.raises(DecryptError):
        decrypt(sealed, random_key())


def test_tampered_ciphertext_rejected() -> None:
    key = random_key()
    sealed = encrypt(b"the quick brown fox", key)
    flipped_byte = bytes([sealed.ciphertext[0] ^ 0x01]) + sealed.ciphertext[1:]
    tampered = GcmCiphertext(nonce=sealed.nonce, tag=sealed.tag, ciphertext=flipped_byte)
    with pytest.raises(DecryptError):
        decrypt(tampered, key)


def test_tampered_tag_rejected() -> None:
    key = random_key()
    sealed = encrypt(b"the quick brown fox", key)
    flipped_tag = bytes([sealed.tag[0] ^ 0x01]) + sealed.tag[1:]
    tampered = GcmCiphertext(nonce=sealed.nonce, tag=flipped_tag, ciphertext=sealed.ciphertext)
    with pytest.raises(DecryptError):
        decrypt(tampered, key)


@pytest.mark.parametrize("bad_key_len", [0, 1, 16, 24, 31, 33, 64])
def test_encrypt_rejects_wrong_key_size(bad_key_len: int) -> None:
    with pytest.raises(ValueError, match="AES-256"):
        encrypt(b"x", b"\x00" * bad_key_len)


def test_encrypt_rejects_non_bytes_key() -> None:
    with pytest.raises(TypeError):
        encrypt(b"x", "not-bytes")  # type: ignore[arg-type]


def test_decrypt_rejects_wrong_key_size() -> None:
    sealed = encrypt(b"x", random_key())
    with pytest.raises(ValueError, match="AES-256"):
        decrypt(sealed, b"\x00" * 16)


def test_decrypt_rejects_short_nonce() -> None:
    bad = GcmCiphertext(nonce=b"\x00" * 6, tag=b"\x00" * TAG_SIZE, ciphertext=b"")
    with pytest.raises(DecryptError, match="nonce"):
        decrypt(bad, random_key())


def test_decrypt_rejects_short_tag() -> None:
    bad = GcmCiphertext(nonce=b"\x00" * NONCE_SIZE, tag=b"\x00" * 4, ciphertext=b"")
    with pytest.raises(DecryptError, match="tag"):
        decrypt(bad, random_key())

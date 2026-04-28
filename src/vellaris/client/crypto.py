"""Document-level encrypt/decrypt that composes :mod:`vellaris.core` primitives.

Each upload uses a fresh AES-256 DEK to encrypt the file *and* its filename,
then the DEK is RSA-OAEP-wrapped once per recipient. The server only sees
the ciphertexts and the per-recipient wrapped DEKs.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from uuid import UUID

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey

from vellaris.core.asymmetric import oaep_decrypt, oaep_encrypt
from vellaris.core.symmetric import decrypt as aes_decrypt
from vellaris.core.symmetric import encrypt as aes_encrypt
from vellaris.core.symmetric import random_key
from vellaris.core.wire import pack, unpack


@dataclass(frozen=True, slots=True)
class Recipient:
    """A user we're encrypting the DEK for."""

    user_id: UUID
    public_key: RSAPublicKey


@dataclass(frozen=True, slots=True)
class EncryptedDocument:
    """Bytes ready to ship to ``POST /documents``."""

    encrypted_filename: bytes
    content_hash: str
    ciphertext: bytes
    access: list[tuple[UUID, bytes]]  # (user_id, encrypted_dek)


def _content_hash(data: bytes) -> str:
    """SHA-256 of plaintext, as ``sha256:<hex>``."""
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def encrypt_for_recipients(
    *,
    plaintext: bytes,
    filename: str,
    recipients: list[Recipient],
) -> EncryptedDocument:
    """Encrypt ``plaintext`` and ``filename`` once, wrap the DEK per recipient.

    The recipient list MUST include the owner (server enforces this too).
    """
    if not recipients:
        raise ValueError("recipients must be non-empty (include the owner)")

    dek = random_key()
    sealed = aes_encrypt(plaintext, dek)
    sealed_filename = aes_encrypt(filename.encode("utf-8"), dek)

    access = [(r.user_id, oaep_encrypt(dek, r.public_key)) for r in recipients]

    return EncryptedDocument(
        encrypted_filename=pack(sealed_filename),
        content_hash=_content_hash(plaintext),
        ciphertext=pack(sealed),
        access=access,
    )


@dataclass(frozen=True, slots=True)
class DecryptedDocument:
    """Result of a successful download + decrypt."""

    filename: str
    plaintext: bytes


def decrypt_bundle(
    *,
    ciphertext_blob: bytes,
    encrypted_filename_blob: bytes,
    encrypted_dek: bytes,
    private_key: RSAPrivateKey,
) -> DecryptedDocument:
    """Reverse of :func:`encrypt_for_recipients` for a single recipient."""
    dek = oaep_decrypt(encrypted_dek, private_key)
    plaintext = aes_decrypt(unpack(ciphertext_blob), dek)
    filename = aes_decrypt(unpack(encrypted_filename_blob), dek).decode("utf-8")
    return DecryptedDocument(filename=filename, plaintext=plaintext)

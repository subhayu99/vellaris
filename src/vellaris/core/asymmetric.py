"""RSA-4096 asymmetric primitives.

Two operations live here:

- **OAEP encryption / decryption** for wrapping per-document AES keys
  (DEKs) under a recipient's public key. SHA-256 is used both as the
  hash and as MGF1's underlying hash.
- **RSASSA-PSS signing / verification** for the auth challenge. PSS is
  a different padding from OAEP and sign/verify must NOT reuse the
  encryption helpers — the original PoC's bug.

Keys are exchanged as PEM (PKCS#8 for private, SubjectPublicKeyInfo for
public). Other formats are deliberately not supported here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from vellaris.core.errors import DecryptError, KeyFormatError, SignatureError

KEY_SIZE_BITS: Final[int] = 4096
"""RSA modulus size in bits."""

PUBLIC_EXPONENT: Final[int] = 65537


@dataclass(frozen=True, slots=True)
class RSAKeyPair:
    """A freshly generated RSA-4096 key pair, in `cryptography` object form."""

    private_key: rsa.RSAPrivateKey
    public_key: rsa.RSAPublicKey


def generate_keypair() -> RSAKeyPair:
    """Generate a fresh RSA-4096 key pair."""
    private_key = rsa.generate_private_key(public_exponent=PUBLIC_EXPONENT, key_size=KEY_SIZE_BITS)
    return RSAKeyPair(private_key=private_key, public_key=private_key.public_key())


def serialize_private_key(private_key: rsa.RSAPrivateKey) -> bytes:
    """Serialize an RSA private key to unencrypted PEM (PKCS#8)."""
    return private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def deserialize_private_key(pem: bytes) -> rsa.RSAPrivateKey:
    """Load a PEM-encoded RSA private key. Rejects non-RSA keys."""
    if not isinstance(pem, (bytes, bytearray)):
        raise KeyFormatError(f"private key PEM must be bytes, got {type(pem).__name__}")
    try:
        key = serialization.load_pem_private_key(bytes(pem), password=None)
    except (ValueError, TypeError) as exc:
        raise KeyFormatError(f"failed to load private key: {exc}") from exc
    if not isinstance(key, rsa.RSAPrivateKey):
        raise KeyFormatError(f"expected an RSA private key, got {type(key).__name__}")
    return key


def serialize_public_key(public_key: rsa.RSAPublicKey) -> bytes:
    """Serialize an RSA public key to PEM (SubjectPublicKeyInfo)."""
    return public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def deserialize_public_key(pem: bytes) -> rsa.RSAPublicKey:
    """Load a PEM-encoded RSA public key. Rejects non-RSA keys."""
    if not isinstance(pem, (bytes, bytearray)):
        raise KeyFormatError(f"public key PEM must be bytes, got {type(pem).__name__}")
    try:
        key = serialization.load_pem_public_key(bytes(pem))
    except (ValueError, TypeError) as exc:
        raise KeyFormatError(f"failed to load public key: {exc}") from exc
    if not isinstance(key, rsa.RSAPublicKey):
        raise KeyFormatError(f"expected an RSA public key, got {type(key).__name__}")
    return key


def _oaep_padding() -> padding.OAEP:
    return padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=None,
    )


def _pss_padding() -> padding.PSS:
    # Salt length matches the hash output, the conventional choice.
    return padding.PSS(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        salt_length=padding.PSS.DIGEST_LENGTH,
    )


def oaep_encrypt(plaintext: bytes, public_key: rsa.RSAPublicKey) -> bytes:
    """RSA-OAEP-SHA256 encryption. Used for wrapping AES DEKs per recipient."""
    return public_key.encrypt(plaintext, _oaep_padding())


def oaep_decrypt(ciphertext: bytes, private_key: rsa.RSAPrivateKey) -> bytes:
    """RSA-OAEP-SHA256 decryption."""
    try:
        return private_key.decrypt(ciphertext, _oaep_padding())
    except ValueError as exc:
        raise DecryptError(f"RSA-OAEP decryption failed: {exc}") from exc


def pss_sign(message: bytes, private_key: rsa.RSAPrivateKey) -> bytes:
    """RSASSA-PSS-SHA256 signature. Used for the auth challenge."""
    return private_key.sign(message, _pss_padding(), hashes.SHA256())


def pss_verify(message: bytes, signature: bytes, public_key: rsa.RSAPublicKey) -> None:
    """Verify an RSASSA-PSS-SHA256 signature. Raises :class:`SignatureError` on failure."""
    try:
        public_key.verify(signature, message, _pss_padding(), hashes.SHA256())
    except InvalidSignature as exc:
        raise SignatureError("RSA-PSS signature verification failed") from exc

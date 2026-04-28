"""Typed exception hierarchy for `vellaris.core`.

All crypto failures inherit from :class:`VellarisCryptoError` so callers can
catch a single base. Specific subclasses let callers distinguish *why* an
operation failed (decrypt vs signature vs KDF vs wire format) without
having to inspect message strings.
"""

from __future__ import annotations


class VellarisCryptoError(Exception):
    """Base class for every error raised by `vellaris.core`."""


class DecryptError(VellarisCryptoError):
    """Decryption or AEAD tag verification failed.

    Raised when AES-GCM authentication fails, RSA-OAEP decryption fails,
    or a wrapped private key cannot be unwrapped (wrong passphrase or
    tampered blob).
    """


class SignatureError(VellarisCryptoError):
    """Signature verification failed (RSA-PSS or Ed25519)."""


class KdfError(VellarisCryptoError):
    """Key derivation failed or was given invalid parameters."""


class WireFormatError(VellarisCryptoError):
    """A serialized blob is malformed, truncated, or uses an unknown version."""


class KeyFormatError(VellarisCryptoError):
    """A key blob (PEM, DER, raw) is malformed or has the wrong type."""

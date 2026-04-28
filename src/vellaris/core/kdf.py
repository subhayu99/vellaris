"""Argon2id passphrase-based key derivation.

Argon2id is the password-hashing algorithm specified by RFC 9106 and
recommended by OWASP for passphrase-derived keys. We use its "raw"
mode (no encoded string output) because we want the raw bytes that
become an AES-256 key.

Defaults are intentionally conservative:

- ``memory_cost`` = 256 MiB
- ``time_cost`` = 3 passes
- ``parallelism`` = 4 lanes
- ``salt`` length = 16 bytes
- ``hash_len`` = 32 bytes  (AES-256 key)

These match the parameters advertised on the marketing page so
documentation and implementation cannot drift apart silently. They
are tunable per call via :class:`Argon2Params`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Final

from argon2.low_level import Type, hash_secret_raw

from vellaris.core.errors import KdfError

SALT_SIZE: Final[int] = 16
"""Argon2id salt length in bytes."""

DEFAULT_MEMORY_COST_KIB: Final[int] = 256 * 1024
"""256 MiB, expressed as KiB (Argon2's native unit)."""

DEFAULT_TIME_COST: Final[int] = 3
DEFAULT_PARALLELISM: Final[int] = 4
DEFAULT_KEY_LENGTH: Final[int] = 32  # AES-256


@dataclass(frozen=True, slots=True)
class Argon2Params:
    """Tunable Argon2id parameters.

    All four parameters affect the derived key. To re-derive the same key
    from the same passphrase, the verifier must use *identical* params and
    salt. The wrapping format in :mod:`vellaris.core.wrap` carries them
    alongside the ciphertext.
    """

    memory_cost_kib: int = DEFAULT_MEMORY_COST_KIB
    time_cost: int = DEFAULT_TIME_COST
    parallelism: int = DEFAULT_PARALLELISM
    key_length: int = DEFAULT_KEY_LENGTH

    def __post_init__(self) -> None:
        if self.memory_cost_kib < 8:
            raise KdfError(f"memory_cost_kib must be >= 8 KiB, got {self.memory_cost_kib}")
        if self.time_cost < 1:
            raise KdfError(f"time_cost must be >= 1, got {self.time_cost}")
        if self.parallelism < 1:
            raise KdfError(f"parallelism must be >= 1, got {self.parallelism}")
        if self.key_length < 4:
            raise KdfError(f"key_length must be >= 4 bytes, got {self.key_length}")
        # Argon2 internal constraint: memory must accommodate >= 8 KiB per lane.
        if self.memory_cost_kib < 8 * self.parallelism:
            raise KdfError(
                f"memory_cost_kib ({self.memory_cost_kib}) must be >= "
                f"8 * parallelism ({8 * self.parallelism})"
            )

    def to_dict(self) -> dict[str, int]:
        return {
            "m": self.memory_cost_kib,
            "t": self.time_cost,
            "p": self.parallelism,
            "l": self.key_length,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Argon2Params:
        try:
            return cls(
                memory_cost_kib=int(data["m"]),
                time_cost=int(data["t"]),
                parallelism=int(data["p"]),
                key_length=int(data["l"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise KdfError(f"invalid Argon2 params: {exc}") from exc


def random_salt() -> bytes:
    """Return a fresh 16-byte salt from the OS CSPRNG."""
    return os.urandom(SALT_SIZE)


def derive_key(
    passphrase: bytes | str,
    salt: bytes,
    params: Argon2Params | None = None,
) -> bytes:
    """Derive a raw key from ``passphrase`` and ``salt`` using Argon2id.

    The passphrase is encoded as UTF-8 if a ``str`` is given.
    """
    if params is None:
        params = Argon2Params()
    if isinstance(passphrase, str):
        passphrase = passphrase.encode("utf-8")
    if not isinstance(passphrase, (bytes, bytearray)):
        raise TypeError(f"passphrase must be bytes or str, got {type(passphrase).__name__}")
    if not isinstance(salt, (bytes, bytearray)):
        raise TypeError(f"salt must be bytes, got {type(salt).__name__}")
    if len(salt) < 8:
        raise KdfError(f"salt must be >= 8 bytes, got {len(salt)}")

    return hash_secret_raw(
        secret=bytes(passphrase),
        salt=bytes(salt),
        time_cost=params.time_cost,
        memory_cost=params.memory_cost_kib,
        parallelism=params.parallelism,
        hash_len=params.key_length,
        type=Type.ID,
    )

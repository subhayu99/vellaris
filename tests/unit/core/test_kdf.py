"""Argon2id KDF determinism, sensitivity, and parameter validation."""

from __future__ import annotations

import pytest

from vellaris.core.errors import KdfError
from vellaris.core.kdf import (
    DEFAULT_KEY_LENGTH,
    DEFAULT_MEMORY_COST_KIB,
    DEFAULT_PARALLELISM,
    DEFAULT_TIME_COST,
    SALT_SIZE,
    Argon2Params,
    derive_key,
    random_salt,
)

# Cheap params used everywhere except the one defaults-test, to keep the
# suite fast. Argon2id at 8 KiB / 1 pass is still functional, just not
# attacker-resistant.
CHEAP = Argon2Params(memory_cost_kib=8, time_cost=1, parallelism=1, key_length=32)


def test_random_salt_size() -> None:
    s = random_salt()
    assert len(s) == SALT_SIZE


def test_random_salt_distinct() -> None:
    assert random_salt() != random_salt()


def test_default_params_match_locked_values() -> None:
    p = Argon2Params()
    assert p.memory_cost_kib == DEFAULT_MEMORY_COST_KIB == 256 * 1024
    assert p.time_cost == DEFAULT_TIME_COST == 3
    assert p.parallelism == DEFAULT_PARALLELISM == 4
    assert p.key_length == DEFAULT_KEY_LENGTH == 32


def test_derive_key_default_params_returns_32_bytes() -> None:
    """One end-to-end run with the locked production defaults."""
    salt = random_salt()
    k = derive_key("any passphrase will do", salt)
    assert isinstance(k, bytes)
    assert len(k) == 32


def test_derive_key_deterministic() -> None:
    salt = random_salt()
    a = derive_key(b"hunter2", salt, CHEAP)
    b = derive_key(b"hunter2", salt, CHEAP)
    assert a == b


def test_derive_key_str_and_bytes_equivalent() -> None:
    salt = random_salt()
    a = derive_key("café", salt, CHEAP)
    b = derive_key("café".encode(), salt, CHEAP)
    assert a == b


def test_derive_key_salt_sensitivity() -> None:
    a = derive_key(b"hunter2", random_salt(), CHEAP)
    b = derive_key(b"hunter2", random_salt(), CHEAP)
    assert a != b


def test_derive_key_passphrase_sensitivity() -> None:
    salt = random_salt()
    a = derive_key(b"hunter2", salt, CHEAP)
    b = derive_key(b"hunter3", salt, CHEAP)
    assert a != b


def test_derive_key_param_sensitivity_time_cost() -> None:
    salt = random_salt()
    a = derive_key(b"x", salt, Argon2Params(memory_cost_kib=8, time_cost=1, parallelism=1))
    b = derive_key(b"x", salt, Argon2Params(memory_cost_kib=8, time_cost=2, parallelism=1))
    assert a != b


def test_derive_key_param_sensitivity_memory() -> None:
    salt = random_salt()
    a = derive_key(b"x", salt, Argon2Params(memory_cost_kib=8, time_cost=1, parallelism=1))
    b = derive_key(b"x", salt, Argon2Params(memory_cost_kib=16, time_cost=1, parallelism=1))
    assert a != b


def test_derive_key_param_sensitivity_length() -> None:
    salt = random_salt()
    base = {"memory_cost_kib": 8, "time_cost": 1, "parallelism": 1}
    short = derive_key(b"x", salt, Argon2Params(**base, key_length=16))
    long_ = derive_key(b"x", salt, Argon2Params(**base, key_length=32))
    assert len(short) == 16
    assert len(long_) == 32
    # First 16 bytes are not a prefix of the longer output (Argon2 reblends).
    assert long_[:16] != short


def test_derive_key_short_salt_rejected() -> None:
    with pytest.raises(KdfError, match=">= 8 bytes"):
        derive_key(b"x", b"\x00" * 4, CHEAP)


def test_derive_key_non_bytes_salt_rejected() -> None:
    with pytest.raises(TypeError):
        derive_key(b"x", "salty", CHEAP)  # type: ignore[arg-type]


def test_derive_key_wrong_passphrase_type_rejected() -> None:
    with pytest.raises(TypeError):
        derive_key(123, random_salt(), CHEAP)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"memory_cost_kib": 0},
        {"memory_cost_kib": 4},
        {"time_cost": 0},
        {"parallelism": 0},
        {"key_length": 0},
        {"key_length": 3},
        {"memory_cost_kib": 8, "parallelism": 4},  # violates 8 KiB/lane rule
    ],
)
def test_argon2params_validates(kwargs: dict[str, int]) -> None:
    base = {"memory_cost_kib": 8, "time_cost": 1, "parallelism": 1, "key_length": 32}
    base.update(kwargs)
    with pytest.raises(KdfError):
        Argon2Params(**base)  # type: ignore[arg-type]


def test_argon2params_dict_round_trip() -> None:
    p = Argon2Params(memory_cost_kib=64, time_cost=2, parallelism=2, key_length=32)
    assert Argon2Params.from_dict(p.to_dict()) == p


def test_argon2params_from_dict_rejects_garbage() -> None:
    with pytest.raises(KdfError):
        Argon2Params.from_dict({"m": "lots", "t": 3, "p": 4, "l": 32})
    with pytest.raises(KdfError):
        Argon2Params.from_dict({"t": 3, "p": 4, "l": 32})  # missing 'm'

"""Console-script entry points for the Vellaris server.

`vellaris-server`                    — run uvicorn (with optional auto-migrate first).
`vellaris-server migrate`            — run alembic upgrade head and exit.
`vellaris-server generate-vapid-key` — emit a fresh raw P-256 private key for VAPID.
"""

from __future__ import annotations

import sys

import uvicorn

from vellaris.server._drivers import check_async_driver
from vellaris.server.config import get_settings


def _check_drivers() -> None:
    settings = get_settings()
    check_async_driver(settings.database_url)


def _generate_vapid_key() -> None:
    """Emit a fresh 32-byte P-256 private key + setup hints.

    Stdout: the raw 32-byte private key (binary). Suitable for piping
    into a file or directly into Secret Manager. Stderr: the matching
    base64url public key + a short setup snippet so operators don't have
    to look up the env-var names.
    """
    from vellaris.server.push import generate_vapid_key_pair

    private, public_b64 = generate_vapid_key_pair()
    sys.stdout.buffer.write(private)
    sys.stdout.buffer.flush()
    sys.stderr.write(
        f"# wrote 32 bytes (raw P-256 private key) to stdout.\n"
        f"# Public key (base64url): {public_b64}\n"
        f"#\n"
        f"# Now:\n"
        f"#   gcloud secrets create vellaris-vapid-key --data-file=vapid.key\n"
        f"#   set VELLARIS_VAPID_PRIVATE_KEY_PATH=/secrets/vapid.key on Cloud Run\n"
        f"#   set VELLARIS_VAPID_SUBJECT=mailto:you@example.com (used as the operator contact).\n"
    )


def main() -> None:
    """Run the FastAPI app under uvicorn, optionally running migrations first."""
    if len(sys.argv) >= 2 and sys.argv[1] == "migrate":
        _check_drivers()
        from vellaris.server._migrate import upgrade_to_head

        upgrade_to_head()
        return

    if len(sys.argv) >= 2 and sys.argv[1] == "generate-vapid-key":
        _generate_vapid_key()
        return

    settings = get_settings()
    _check_drivers()
    if settings.auto_migrate:
        from vellaris.server._migrate import upgrade_to_head

        upgrade_to_head()
    uvicorn.run(
        "vellaris.server.app:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":  # pragma: no cover
    main()

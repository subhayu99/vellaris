"""Console-script entry point that launches the Vellaris server via uvicorn."""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    """Run the FastAPI app under uvicorn.

    Honors `VELLARIS_HOST` (default 0.0.0.0) and `VELLARIS_PORT` (default 8000).
    """
    host = os.environ.get("VELLARIS_HOST", "0.0.0.0")
    port = int(os.environ.get("VELLARIS_PORT", "8000"))
    uvicorn.run("vellaris.server.app:app", host=host, port=port, reload=False)


if __name__ == "__main__":  # pragma: no cover
    main()

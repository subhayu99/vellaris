"""Dump the FastAPI app's OpenAPI schema to web/src/docs/pages/api/openapi.json.

Run via:
    make gen-openapi

CI verifies the committed copy matches via `git diff --exit-code` after
running this script — catches stale schemas in PRs that touch routes/.
"""

from __future__ import annotations

import json
from pathlib import Path

from vellaris.server.app import app


def main() -> None:
    schema = app.openapi()
    out = Path("web/src/docs/pages/api/openapi.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"wrote {out} ({len(schema.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()

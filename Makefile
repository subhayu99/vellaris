.PHONY: gen-openapi

# Generate the OpenAPI schema for the docs API playground.
# Run this after changing anything under src/vellaris/server/routes/.
# CI verifies the committed copy is up-to-date — see .github/workflows/release.yml.
gen-openapi:
	@command -v uv >/dev/null 2>&1 && uv run python scripts/gen-openapi.py || python scripts/gen-openapi.py

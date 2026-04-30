.PHONY: gen-openapi

gen-openapi:
	uv run python scripts/gen-openapi.py

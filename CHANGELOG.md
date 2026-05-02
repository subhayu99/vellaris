## 0.5.6 — 2026-05-02

### Added

- **`<Notice>` primitive** with `error` / `success` / `warn` / `info` variants and `role="alert"` / `role="status"` for assistive tech. Replaces the duplicated four-token-deep error/success boxes across `/dashboard`, `/doc/:id`, `/upload`, `/settings`.
- **`<Spinner>` primitive** for inline busy indicators. Wired into the share button and the keyblob "Push to server" button (which used to flip text-only `Share → Sharing…` with no visual cue). Respects `prefers-reduced-motion`.
- **Appearance section in `/settings`** with a theme-toggle button using the same `useTheme` hook as the marketing/docs nav.
- **Skip-to-main-content link** on all four layouts (auth, dashboard, marketing, docs). Visually hidden until focused via Tab, slides into view top-left, jumps focus past nav/sidebar straight into the page body.

### Fixed

- **Theme persistence** — the saved theme was only re-applied when the user passed through marketing or docs first. Direct landings on `/connect`, `/login`, or any authenticated route ignored the preference. `useTheme()` now also runs in `AuthLayout` and `DashboardLayout`.
- **Phone-width grid stacking pass.** The auto-fit grids in the deployment configurator (`install-panel-grid`, `install-grid-3`, `install-advanced-grid`), the CLI / SDK builder args grids, and the docs page-shell `.docs-h1-row` / hub featured card / plate grid / prev-next all force single-column layouts below 480px. The `auto-fit minmax(220–260px, 1fr)` pattern was leaving ~155px per cell after parent padding on iPhone-SE-class viewports.
- **Footer grid stacks single-column below 480px.** A 1100px rule was overriding the 720px rule for 481–720px viewports; an explicit `1fr` at 480px now wins.

### Changed

- **Touch targets** bumped to ≥44px on the API endpoint list, CLI command tiles, SDK recipe tiles, footer "build" version button, and marketing theme toggle.

## 0.5.5 — 2026-05-02

### Added

- **Mobile hamburger menu** on the marketing and `/docs` top nav. Below 900px the inline section links + GitHub + theme toggle + Sign in collapse into a dropdown drawer anchored under the sticky nav. Escape and item-tap both close it.
- **`<ConfirmDialog>` component** replaces `window.confirm()` for destructive actions ("Delete document" in `/doc/:id`, "Delete server copy" in `/settings`). Mobile bottom-sheet, Escape-to-cancel, body-scroll lock.
- **Build-time version injection.** `vite.config.ts` now reads `pyproject.toml`'s `[project].version` at build time and exposes it as `APP_VERSION`. The footer / docs nav / docs sidebar / docs index plate / get-started / hero terminal / Helm chart sketch / deployment exporter all read from it instead of hardcoding `v0.4.1`.

### Fixed

- **Docs tables had misaligned headers when scrolling on mobile.** The 0.5.4 CSS-only fix put `<thead>` and `<tbody>` into independent `display: table` layouts, which let column widths drift apart. Replaced with a JSX wrapper (`<div className="docs-table-scroll">`) so the table stays one layout and only the wrapper scrolls. Applies to trust-model, cli, sdk, protocol, and the three deployment-page tables.
- **Deployment configurator unusable on mobile.** Number-input labels stack label-above-input below 720px instead of cramming text beside the input. Radio/checkbox labels with mixed inline content (text + `<code>` + `<em>`) switch to `display: block` so the prose reflows naturally instead of breaking into one flex item per element. Advanced-config summary header stacks vertically on phones.
- **API playground overflowed the right edge on phones.** Server URL / Authorization token inputs and the snippet code block were clipped because grid `1fr` defaulted to a min-content floor and long mono tokens (curl one-liners) pushed the column past the viewport. Tracks now use `minmax(0, 1fr)` and children explicitly set `min-width: 0`. Endpoint-list buttons wrap and the path word-breaks so `/users/by-username/{username}` stays inside its column.
- **Protocol page binary diagrams** shrink to `font-size: 10.5px` below 720px so noticeably more of the box-drawing fits before the user has to swipe; columns stay aligned because every glyph still ships at the same monospace cell.
- **Marketing landing overflow on phones.** The "Read every line." section and the architecture diagram's "no decryption keys here" chip both broke layout below 480px because long mono tokens forced their flex containers wider than the viewport. The install-card command box now scrolls horizontally inside its own border, repo-meta rows stack label-above-value below 720px, and the architecture server card stacks its right-column chip + uptime side-by-side rather than over-vertically.

### Changed

- **Color-token drift cleanup.** `--color-gold-2` (#d4b066) now lives in the design-system `@theme` block. Every `bg-[rgba(...)]` arbitrary value across routes was replaced with token opacity modifiers (`bg-danger/10`, `bg-warn/8`, `bg-gold/8`). The `signup.tsx` "replacing existing key" warning loses its inline `style={{...}}` block in favor of token classes.
- **Platform-aware keyboard shortcut hint.** The disabled command-palette trigger now renders `⌘K` on macOS/iOS and `Ctrl+K` everywhere else, instead of always showing `⌘K`.
- **API playground stacks at 900px** (was 800px) so the endpoint-list + form/snippet pane stops being cramped between 800–900px viewports.

## 0.5.4 — 2026-05-02

### Fixed

- **Dashboard row hover broken.** The file rows in `/dashboard` referenced an undefined `hover:bg-bg-hover` Tailwind class, so the hover background never rendered. Replaced with `hover:bg-line` (the same token the sidebar nav links use) and added a focus-visible ring + screen-reader label.

### Changed

- **Mobile responsiveness pass on the SPA.** The authenticated app now usable on phones — sidebar collapses behind a hamburger drawer below `md`, form rows (share, recipient, key-blob actions, settings disconnect) stack vertically on narrow viewports, headings scale, tap targets bumped to ≥44px on the back link / sidebar logout / chip close affordances, document-detail metadata grid stacks single-column, and `AuthLayout` / `DashboardLayout` paddings shrink with breakpoint.
- **Mobile responsiveness pass on the docs + marketing site.** Wide tables in `/docs/cli`, `/docs/sdk`, `/docs/protocol`, `/docs/trust-model`, `/docs/deployment` now scroll horizontally inside their own container instead of overflowing the page. The mobile rail and code blocks gained right-edge fade gradients so the user discovers horizontal scroll. The `/docs/protocol` auth-flow SVG is given a `min-width` and a horizontally-scrollable container below 720px so its labels stay legible. The marketing hero CTAs and install button stack full-width below 480px instead of wrapping unpredictably between 360–375px.

## 0.5.2 — 2026-05-01

### Changed

- **Liveness route renamed `/healthz` → `/health`.** Cloud Run / Knative reserves paths under `/healthz` for platform probes, which prevented the app from serving its own liveness route there. The Python and TS clients' `healthz()` methods are renamed to `health()` and the Docker `HEALTHCHECK` now hits `/health`. If you have external monitors or proxies pointed at `/healthz`, repoint them.

## 0.5.1 — 2026-04-30

### Fixed

- **PyPI sdist→wheel build.** The `[tool.hatch.build.targets.sdist]` `include` list was missing `alembic/` and `alembic.ini`, so the strict-mode "build wheel from sdist" check that PyPI runs on publish couldn't satisfy the wheel's `force-include` block. v0.5.0 never published to PyPI as a result; v0.5.1 is the same code with the packaging fix.

## 0.5.0 — 2026-04-30

### Breaking changes

- **`VELLARIS_BLOB_BACKEND`, `VELLARIS_BLOB_ROOT`, `VELLARIS_S3_*` are removed.** Replaced by a single `VELLARIS_BLOB_URL` (an fsspec URL — `file://`, `s3://`, `gs://`, `az://`, etc.) plus an optional `VELLARIS_BLOB_OPTIONS_JSON`. Cloud credentials now flow through standard env vars (`AWS_*`, `GOOGLE_APPLICATION_CREDENTIALS`, `AZURE_*`) that fsspec reads natively.
- **`boto3` removed from base server install.** Install S3 support via `pip install vellaris[s3]` or use the `:VERSION-full` Docker tag.
- **Default Postgres async driver is now `asyncpg`.** `psycopg` URLs still work but the slim Docker image no longer bundles it; install via `pip install vellaris[postgres]`.

### Added

- **fsspec storage layer** — local FS, S3-compatible (AWS / MinIO / R2 / B2 / Wasabi), GCS, Azure Blob, SFTP, memory, etc. all via one URL.
- **MySQL / MariaDB support** via `vellaris[mysql]`.
- **Two Docker image variants:**
  - `:0.5.0` (slim, ~120 MB) — sqlite + local FS only.
  - `:0.5.0-full` (~350 MB) — every DB driver + every cloud storage backend.
- **`/docs/install` configurator** — pick run mode + DB + storage + image and copy a tailored `docker run` / `compose.yaml` / `Dockerfile` / `pip install` snippet.
- **Interactive CLI command builder** at `/docs/cli` — pick a command, fill args, copy.
- **Interactive SDK starter generator** at `/docs/sdk` — pick a recipe (upload / upload-and-share / download / list / share / revoke), pick async/sync, copy a runnable Python snippet.
- **Interactive API endpoint playground** at `/docs/api` — schema-driven generator (auto-built from FastAPI's OpenAPI); emits curl / Python httpx / JS fetch snippets per endpoint.
- **Advanced configuration panel** on `/docs/deployment` — rate limits, sessions, CORS, audit-key handling, replicas, reverse proxy (Caddy/nginx/Traefik), TLS.
- **Helm `values.yaml` and systemd unit file** as run-mode outputs in the deployment configurator.
- **Reverse-proxy snippet** (Caddyfile / nginx / Traefik labels) emitted alongside the main snippet when a proxy is configured.
- **Auto-migrations on startup** — controlled by `VELLARIS_AUTO_MIGRATE` (default `1`). Set to `0` for blue/green pipelines.
- **`vellaris-server migrate` subcommand** for explicit migration runs.
- **Pip extras:** `[sqlite]`, `[postgres]`, `[mysql]`, `[s3]`, `[gcs]`, `[azure]`, `[all-db]`, `[all-storage]`, `[all]`.

### Changed

- `/docs/install` is now `/docs/deployment`. The old URL redirects.

### Fixed

- Slim Docker image now actually boots with the documented SQLite default (was missing `aiosqlite`).
- `docs/deployment.md` env-var names match the code (multiple drift bugs corrected).
- Compose stack now uses `asyncpg` and the new `VELLARIS_BLOB_URL`.
- `alembic/env.py` async-to-sync URL translation now uses `psycopg2` (matches the new `[postgres]` extra; was `psycopg` v3 which isn't installed).

### Migration guide

The `/docs/install` configurator emits the snippet that matches your existing setup. For most operators:

1. Pull `:0.5.0` (slim) or `:0.5.0-full`.
2. Translate old env vars:
   - `VELLARIS_BLOB_BACKEND=local` + `VELLARIS_BLOB_ROOT=/x` → `VELLARIS_BLOB_URL=file:///x`
   - `VELLARIS_BLOB_BACKEND=s3` + `VELLARIS_S3_BUCKET=b` → `VELLARIS_BLOB_URL=s3://b` (plus standard `AWS_*` env vars)
3. If you use a custom psycopg driver string, switch to `asyncpg` for the slim image: `postgresql+psycopg://...` → `postgresql+asyncpg://...`.

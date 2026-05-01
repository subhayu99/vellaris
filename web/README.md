# Vellaris Web

The static SPA half of [Vellaris](../README.md) — a Vite + React 19 +
TypeScript + Tailwind v4 app that does **all** the crypto in the browser
and talks to a self-hosted Vellaris server over HTTP.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

The first-load screen asks for the URL of your Vellaris server (e.g.
`http://localhost:8000`). After a successful `GET /health` probe the
URL is cached in `localStorage` and you skip straight to login on
subsequent visits.

To run a local stack:

```bash
# in repo root
uv venv .venv --python 3.12
source .venv/bin/activate
uv pip install -e ".[dev]"
alembic upgrade head
vellaris-server   # listens on :8000

# in web/
pnpm dev          # listens on :5173
```

## Scripts

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Vite dev server with HMR                  |
| `pnpm build`      | `tsc -b && vite build` — emits to `dist/` |
| `pnpm preview`    | Serve the production build locally        |
| `pnpm test`       | Vitest one-shot run                       |
| `pnpm test:watch` | Vitest watch mode                         |
| `pnpm test:ui`    | Vitest UI                                 |
| `pnpm lint`       | ESLint                                    |
| `pnpm lint:fix`   | ESLint with auto-fix                      |
| `pnpm typecheck`  | `tsc -b --noEmit`                         |
| `pnpm format`     | Prettier write                            |

## Layout

```
web/src/
├── api/            # VellarisClient — HTTP wrapper around the FastAPI server
├── components/     # Button, Field, EncryptAnim (champagne thread), VSigil…
├── crypto/         # TS port of vellaris.core (AES-GCM, RSA-OAEP/PSS, Argon2id, wrap)
├── routes/         # React Router pages: connect, signup, login, home
├── state/          # localStorage-backed stores: server URL, session, key blob
├── styles/         # locked design tokens (referenced from index.css @theme)
├── test/           # vitest setup
└── util/           # uuid → bytes, etc.
web/tests/
├── fixtures/       # Python-produced binary fixtures + generate.py
└── interop.test.ts # byte-level Python ↔ TS interop assertions
```

## Wire compatibility

Every wire format produced by `web/src/crypto/` matches
`src/vellaris/core/` byte-for-byte. The interop test
(`web/tests/interop.test.ts`) re-decodes Python-produced fixtures with
the TS port; if any layout drifts the test fails first. To regenerate
fixtures:

```bash
.venv/bin/python web/tests/fixtures/generate.py
```

## Design system

Tailwind v4 with all locked Vellaris tokens declared as `@theme`
variables in `src/index.css` — no separate config. Colors midnight /
indigo / ivory / gold / gold-soft, fonts Newsreader (serif) / Inter
(sans) / JetBrains Mono (mono) loaded from Google Fonts in
`index.html`.

The JSX prototype at `~/Downloads/Vellaris/src/` is the design source
of truth — port from there, don't redesign.

## Crypto choices

| Primitive     | Library                  | Why                                                                 |
| ------------- | ------------------------ | ------------------------------------------------------------------- |
| AES-256-GCM   | `crypto.subtle` (native) | Browser-native, hardware-accelerated where available                |
| RSA-4096 OAEP | `crypto.subtle`          | Same                                                                |
| RSA-PSS       | `crypto.subtle`          | Distinct CryptoKey handle — different padding from OAEP             |
| Argon2id      | `hash-wasm`              | Active maintainer, single small wasm bundle. Beats `argon2-browser` |

PEM serialization writes 64-char body lines + trailing `\n` to match
Python's `cryptography` output for byte-equality with CLI fixtures.

## Analytics

The SPA fires Cloudflare Web Analytics pageviews only from the public
route components (`/connect`, `/signup`, `/login`). Each of those calls
`trackPageview(path)` from `components/cloudflare-beacon.tsx` on mount.
Authenticated routes (`/dashboard`, `/doc/:id`, `/upload`, `/settings`)
never call it, so Cloudflare never sees document UUIDs or any
post-login URLs.

The beacon is loaded with `"spa": false`, which disables Cloudflare's
default `history.pushState` auto-tracking. That auto-tracking was the
v0.1.x leak: even after `AuthLayout` unmounted and we removed the
`<script>` tag, the listeners it had already attached to `pushState`
kept firing for every authenticated route in the session. Manual
pageviews + `spa: false` close the leak.

`trackPageview` removes any prior beacon `<script>` and inserts a fresh
one on each call so the IIFE re-runs and Cloudflare records a new
pageview for the current `window.location`. The `path` argument is for
self-documenting call sites; the beacon picks the URL up itself.

The beacon token comes from `VITE_CF_BEACON_TOKEN` (Vite env var, baked
in at build time). If unset (dev, CI, PR builds), the beacon never
loads. Production releases pull it from a GitHub repository secret —
set under Settings → Secrets and variables → Actions →
**Repository secrets** → name `VITE_CF_BEACON_TOKEN`. Get the token
itself from `dash.cloudflare.com` → Web Analytics → Add a site → "I
don't have a website on Cloudflare" → copy the value of the `token` key
from the `data-cf-beacon` attribute.

/**
 * Build-time-injected canonical version, sourced from `pyproject.toml`'s
 * `[project].version` by `vite.config.ts` (the `define` block replaces
 * `__APP_VERSION__` with the literal string at compile time).
 *
 * Use this anywhere the docs / nav / footer used to hardcode the app
 * version. The `declare const` is module-scoped so it doesn't collide
 * with `moduleDetection: "force"` in tsconfig.app.json.
 */
declare const __APP_VERSION__: string

export const APP_VERSION: string = __APP_VERSION__

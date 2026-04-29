# Vellaris analytics

Time-series data for the Vellaris project. **This is an orphan branch** — no
shared history with `main`. Each commit appends one row of data.

## Why an orphan branch

- Daily commits on `main` would be noise.
- `git log --oneline stats -- analytics/ghcr-pulls.csv` reads like a
  row-level changelog.
- Free hosting (it's just GitHub).
- Trivial to scrape externally — raw CSV at
  `https://raw.githubusercontent.com/subhayu99/vellaris/stats/analytics/ghcr-pulls.csv`
  feeds any chart tool that takes CSV.

## Files

| Path                        | What                                                    |
| --------------------------- | ------------------------------------------------------- |
| `analytics/ghcr-pulls.csv`  | Daily snapshot of `ghcr.io/subhayu99/vellaris` pulls    |

## Schema

```
date,ghcr_pulls,scraped_from,note
2026-04-29,42,html-grep,
2026-04-30,57,html-grep,
2026-05-01,,api-404,GitHub returned 404 — package may have been renamed
```

- `date` (ISO 8601, UTC) — when the snapshot was taken.
- `ghcr_pulls` — total pulls reported by the GHCR package page (cumulative).
  Empty if the scrape failed; `note` will say why.
- `scraped_from` — `html-grep` (current implementation), `api` (future), `manual`.
- `note` — free text, useful for "scrape failed, see workflow run X".

## Updating

Automated by `.github/workflows/stats.yml` on `main` — runs daily at
03:00 UTC, plus on demand via `workflow_dispatch`.

## Plotting

The CSV is small enough (1 row/day = ~365 rows/year) to paste into Google
Sheets and chart there. For something more permanent, `gnuplot` /
`matplotlib` / a tiny HTML+canvas page consume the raw URL.

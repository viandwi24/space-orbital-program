# 369 — Cached shadow maps for the static site

**Plan:** [plans/369-cached-shadow-maps-for-the-static-site.md](../plans/369-cached-shadow-maps-for-the-static-site.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0357](../decisions/0357-site-shadow-cache-not-built.md)

## What was done

Counted the shadow casters at the pad (23 site meshes of about 190 000 triangles, the vessel about 35 000) and measured what the site's casters cost with `scripts/measure-site-shadow.ts` (the casters on and off in turn, in one page). Nothing was built.

## Numbers (M5, Chrome, 120 Hz, TAAU off, three rounds of 10 s; load 4 to 12)

| | p50 | p95 | GPU ms |
|---|---|---|---|
| medium, casters on | 8.43 | 17.00 | 3.12 |
| medium, casters off | 8.43 | 17.27 | 3.03 |
| high, casters on | 13.87 | 25.40 | 3.77 |
| high, casters off | 11.37 | 30.53 | 3.85 |

Removing every static caster changes the GPU time by about 0.1 ms; the `high` intervals are load noise (p50 better, p95 worse). A cache would pay a full depth copy per frame to save that.

## Not done

The cache, by decision. `measure-sunrise.ts` and `capture-graphics.ts` were not needed (no shader or look changed).

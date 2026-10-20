---
id: 251
title: "Graphics phase 0: measurement tools, feature switches, a frame-time histogram and the M5 Retina baseline"
status: ready
owner: "Worker A"
depends: []
phase: 7
created: 2026-10-20
updated: 2026-10-20
---

# 251 — Graphics phase 0: measurement tools, feature switches, a frame-time histogram and the M5 Retina baseline

**Size:** M

## Goal

Get numbers that judge every graphics change before v1.0.0. The numbers are:
- frame time by pixel ratio and preset on the MacBook Pro M5's own display;
- each `high` feature's share of the frame;
- the frame-interval distribution a player feels.

## Context

- **Owner order, 2026-10-20:** "Buatkan plan grafis fase 0+1 sekarang dan masukkan ke v1.0 sebelum rilis." Graphics come second only to gameplay, because a lagging game is not playable.
- **Research:** `refs/graphics-performance/` (README, 01 diagnosis, 02 measurements, 06 plan and cost: phase 0).
  - `high` caps the pixel ratio at 2 (`packages/renderer/src/presets.ts:133`), so a 14" Retina screen draws about 5.7 Mpx against the 2.07 Mpx every budget was set at (ADR 0053: `high` ≤ 16.7 ms on the M5 at 1080p).
  - On the M2, cost follows pixels almost linearly.
  - `high` costs about 4× `medium` at every ratio, and nobody knows which feature causes it.
- **Existing tools:**
  - `refs/graphics-performance/tools/measure-dpr.ts` is the script behind the M2 runs (viewport, scale factor, presets, ratios);
  - `apps/web/scripts/measure-devices.ts` is the older device script.
- **Governor:** it sees only the rAF interval (`apps/web/src/lib/flight-loop.ts`, `packages/renderer/src/quality-governor.ts`). The Debug panel's performance tab (plan 203) shows FPS but no distribution.

## Scope

**In:**
- **One measuring script** in `apps/web/scripts/` (fold `measure-dpr.ts` into `measure-devices.ts` or move it beside it), with these options:
  - viewport and device scale factor;
  - preset and pixel ratio;
  - the scene list (pad, 3 km, 12 km, orbit, hillside);
  - headed Chromium;
  - JSON output.
- **Feature switches on the debug API** (`window.__orbitalDebug` / `renderer.debug`) for ablation. Each switch toggles one `high` extra against `medium`:
  - shadow map size;
  - cloud shadow (noise or baked map);
  - shaft samples and terrain reads;
  - cloud erosion octaves;
  - tufts;
  - MSAA;
  - canvas antialias.
- **A frame-time histogram in Debug → Performance:** p50, p95 and p99 of the frame interval, plus the share of frames over 16.7 ms and over 33.3 ms. It covers the last 2 minutes and can be reset.
- **The M5 baseline**, recorded in `refs/graphics-performance/data/m5-*.json` and summarised in a new `refs/graphics-performance/07-m5-baseline.md`:
  - `medium` and `high` at ratios 1, 1.5 and 2 on the built-in display;
  - the per-feature ablation at ratio 2;
  - a 2-minute free-flight frame-interval trace with the governor on.

**Out:** any change to how a frame is drawn (plans 252 and 253).

## Touches

- `apps/web/scripts/measure-*.ts`
- `packages/renderer/src/{renderer,presets,environment}.ts`: debug switches only
- `apps/web/src/lib/debug/*`
- `refs/graphics-performance/`

## Steps

1. Build the script and the debug switches, with unit tests for the switches. A switch must restore its default when turned off.
2. Add the histogram to Debug → Performance, with a unit test for the percentile maths.
3. **Run the baseline on a quiet M5.** This is a heavy job:
   - take `/tmp/orbital-heavy.lock`;
   - wait until the release integration e2e (plan 232's batch) is not running and the 1-minute load is ≤ 3;
   - keep the machine plugged in;
   - use the journal 054 method: second load, then precompile, then the minimum over windows.
4. Write `07-m5-baseline.md`:
   - the table;
   - the ablation ranking (which features make `high` 4×);
   - the numbers plan 252 must beat.
5. Run light checks, push `ready/251`, and follow the worker brief (batch mode).

## Acceptance criteria

- [ ] The script measures any preset, pixel ratio and scene on a chosen viewport and scale factor.
- [ ] Debug switches toggle each `high` extra; tests pass.
- [ ] Debug → Performance shows p50/p95/p99 and the over-budget shares.
- [ ] `refs/graphics-performance/07-m5-baseline.md` holds the M5 table at ratios 1, 1.5 and 2, the ablation, and a governor-on trace.
- [ ] CI is green on `ready/251`.

## Docs checklist

- [ ] STATUS row; journal `docs/journal/251-graphics-measure-baseline.md`.

## Log

- 2026-10-20: Created by the coordinator from `refs/graphics-performance/06-plan-and-cost.md` phase 0, at the owner's order to ship phases 0 and 1 in v1.0.0. Ready: checked against main @ 8bf82bb9 (`presets.ts:133` pixel ratio 2; governor defaults `quality-governor.ts:85-96`).

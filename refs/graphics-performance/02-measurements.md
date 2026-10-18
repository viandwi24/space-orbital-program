# 02 — Measurements: frame time against pixel ratio (MacBook Pro M2 13", 2026-10-18/19)

## Method

- **Build and serve:** a `NODE_ENV=development` production build (it exposes the `__orbital` hook), served by `apps/web/scripts/serve.ts` on port 5211.
- **Browser:** headed Chromium (Playwright), ANGLE on Metal, with the window in view (journal 066: headless reads about 3× high).
- **Viewport:** **1512×945 CSS pixels at device scale factor 2**, the default "looks like" size of a 14" MacBook Pro. At pixel ratio 2 the canvas is 3024×1890.
- **Load and settings:** the two-stage example on the pad, governor off, the second load of each preset, then `renderer().precompile()`.
- **Varied:** the pixel ratio, through `renderer.debug.setPixelRatio(1 | 1.5 | 2)`; the scenes, by moving the vessel in a synthetic snapshot as journal 054 does.
- **Number:** "sync ms", the minimum over 10 windows of the mean of 6 single frames, each `debug.benchmark(1)` (draw + `readPixels`).
- **Rungs:** at ratio 2, `setPlanetScale(0.5)` (the half rung) and `setRenderScale(0.67)`.
- **Script:** a throwaway variant of `apps/web/scripts/measure-devices.ts`, not committed. Raw JSON is in the session scratchpad, numbers below.

## Results (sync ms; lower is better; 16.7 ms = 60 fps)

**`high`** (run 1, ratios ascending; run 2, ratios descending, 8 s settle):

| Pixel ratio (canvas, Mpx) | pad | 3 km | 12 km | orbit 100 km |
|---|---|---|---|---|
| 1 (1512×945, 1.43) | 92.4 / 95.1 | 110.9 / 108.9 | 102.1 / 101.7 | 62.5 / 62.8 |
| 1.5 (2268×1417, 3.21) | 195.0 / 194.3 | 242.8 / 232.9 | 223.6 / 218.7 | 132.7 / 137.3 |
| 2 (3024×1890, 5.72) | 333.0 / 336.4 | 399.7 / 407.5 | 339.0 / 380.8 | 219.1 / 235.4 |
| 2, planet pass at half | 114.8 / 117.2 | 118.3 / 128.2 | | |
| 2, render scale 0.67 | 154.2 / 162.2 | 170.8 / 188.7 | | |

**`medium`** (run 1):

| Pixel ratio | pad | 3 km | 12 km | orbit |
|---|---|---|---|---|
| 1 | 22.5 | 23.8 | 23.9 | 16.2 |
| 1.5 | 43.8 | 52.9 | 52.6 | 32.9 |
| 2 | 75.2 | 90.8 | 91.3 | 58.3 |
| 2, planet pass at half | 40.6 | 41.4 | | |
| 2, render scale 0.67 | 37.8 | 42.8 | | |

## What the numbers say

1. **Cost follows pixels almost linearly.**
   - Pixels go 1 : 2.25 : 4; `high` at the pad goes 1 : 2.1 : 3.6, and `medium` 1 : 1.95 : 3.35.
   - Per Mpx, `high` costs 65, 61 and 58 ms: a small fixed part, the rest per pixel.
   - So pixel ratio 2 is the first thing to fix, as [01](01-diagnosis.md) §5 predicts.
2. **The half planet pass is the strongest existing lever.** At ratio 2 it removes 65 % of `high` at the pad, and more than drawing everything at 0.67.
   - Why: the vessel, the HUD and the meshes stay at full resolution, while only the expensive fullscreen shader shrinks.
   - This supports a *pixel budget for the planet pass* instead of a global pixel ratio ([04](04-techniques.md) §1).
3. **`high` is about 4× `medium` on this machine at every ratio.** That is much more than the preset table alone suggests (12 vs 12 view samples, 6 vs 4 cloud steps, 11 vs 9 ground octaves, …).
   - The candidates are `high`'s extras: 4096 shadows, 4-octave cloud shadow noise, 8 shafts × 4 terrain reads, 3-octave cloud erosion, 28000 tufts. The M2's 100 GB/s of bandwidth hits them harder.
   - A per-feature ablation is needed to split the 4× (Phase 0 in [06](06-plan-and-cost.md)).

## Caveats (read before quoting a number)

- **Absolute numbers on this machine today are not trustworthy.**
  - `high` at ratio 1 (1.43 Mpx) read 92–95 ms here, but journal 066 measured 40 ms at 1080p (2.07 Mpx) on the same M2 on 2026-10-17.
  - A third run at 1920×1080 ratio 1 read `medium` 105 ms against journal 066's 33 ms.
  - Candidates:
    - load from parallel work (a research agent was running; load average 3.7);
    - presets that have grown since 066 (plan 133 silhouette AA, the n-body work);
    - the browser version.
  - No thermal warning was recorded (`pmset -g therm`).
  - **The ratios inside one run are consistent between runs 1 and 2 and are what this document relies on.**
- These are M2 numbers. The M5 is about 1.7× the M2 in Geekbench Metal ([00](00-sources.md) S31) and about 3× in our own scenes (journal 066).
- `debug.benchmark` measures draw plus a `readPixels` stall, not the frame pacing a player sees. Perceived smoothness also depends on the governor's retries ([01](01-diagnosis.md) §4).

## Needed next (owner or Agent 1, on the M5)

The same table on the M5, plugged in, after 10 minutes idle (journal 054 method):
- presets `medium` and `high` at ratios 1, 1.5 and 2 on the built-in display;
- plus a frame-interval trace of two minutes of free flight with the governor on, as p50, p95 and p99 and the share of frames over 16.7 ms.

That gives the baseline every later phase is judged against.

# 066 — Environment on real devices (the M2 row)

**Plan:** [plans/066-environment-devices-and-mobile.md](../plans/066-environment-devices-and-mobile.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0157](../decisions/0157-the-base-m1-and-m2-start-on-low.md) (new), [0025](../decisions/0025-release-quality-visual-bar.md), [0053](../decisions/0053-frame-budget-governor-march-prepass-and-terrain-veil.md) · **Research:** `three.md` (plan 066)

**Status when written: the M2 row is measured and `selectPreset` follows it; the integrated Intel and phone rows are not (no such hardware here).**

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/presets.ts` | the base M1 and M2 start on `low`; their Pro, Max and Ultra keep `medium` (ADR 0157) |
| tests | `presets.test.ts` (+1: M1 and M2 `low`, M1 Pro `medium`; the M2 Max case replaces the M2 one), `graphics.test.ts` (a saved `high` wins over the M2's default) |
| `apps/web/scripts/measure-devices.ts` | the device table scripted with Playwright: every preset on its second load, the pad, 3 km, 12 km and orbit by synthetic snapshots, the half-resolution rung, the Space Center, the precompile time, the first-switch hitch and the glass blur; headed by default |

## Method

Journal 054's: a `NODE_ENV=development` production build served by `scripts/serve.ts` on port 5211, the app's browser pane shown, the canvas forced to 1920 x 1080 (`resize` to 1920 / pixel ratio), governor off, the two-stage example on the pad of the Legacy world, every number from the second load of its preset. Scenes by a moved copy of the live snapshot (the vessel straight up 3, 12 and 100 km), rendered with `renderer.update` and benchmarked in the same call. sync = minimum of 12 means of 8 `benchmark(1)`, thr = minimum of 12 `benchmark(8)`. Machine: MacBook Pro 13" M2 (8 GPU cores), 8 GB, swap 6.3 GB in use (other apps open; memory free 76 % during the run); the browser reports `ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)`.

## Frame times on the M2 (sync / thr ms, 1920 x 1080)

| Scene | `low` | `medium` | `high` |
|---|---|---|---|
| pad | 21.56 / 20.25 | 33.01 / 28.55 | 40.25 / 34.86 |
| 3 km | 20.71 / 19.74 | 32.75 / 31.51 | 42.95 / 38.50 |
| 12 km | 23.73 / 19.39 | 34.27 / 30.29 | 44.46 / 39.50 |
| orbit, 100 km | 13.11 / 10.58 | 21.42 / 18.09 | 25.13 / 21.15 |
| pad, half-resolution rung | — | 16.30 / 15.05 | — |
| Space Center, default camera | 23.62 / 21.71 | 35.59 / 30.31 | — |

Budgets (ADR 0053): `high` 16.7, `medium` 13.3. **No preset holds the budget at 1080p on the M2 below 12 km**; `low` is the nearest (about 46 fps at the pad). The M5's `medium` pad read 11.16 (journal 054): the M2 is about three times slower on this scene.

## Precompile and hitch

- Precompile (the second `precompile()` call resolves with the first): 159.6 s after the page loaded on `medium`, 101.6 s on `low` (84 s on the M5).
- First switch after the precompile, `setPreset` + one frame: from `medium` to `low` 73 ms, to `high` 108 ms; from `low` to `medium` 152 ms, to `high` 222 ms. A headless run, which may not have finished its precompile, read 1 562 ms from `low` to `medium`.

## What surprised me

- **Headless reads three times high.** The scripted Playwright run on Metal read `medium` 107 ms at the pad; the same scene in the visible pane read 33 ms. The script runs headed now and says why.
- **A window out of view stops frames.** `requestAnimationFrame` stopped while `document.visibilityState` said `visible`; the glass blur's frame intervals never arrived, so the blur is not measured on the M2 (Agent 1 measured 0.3 to 0.4 ms on the M5, journal 086).
- **The hillside scene drew almost nothing.** Journal 050's spot (26.5 km east, 5.5 km north, ground 1 723 m) read 3.5 ms on `low`: the terrain there has changed since, and the camera was likely under the ground. Left out of the table and of the script.
- **The budget machine misses the budget,** by 2.5 times on `medium`: filed in STATUS for a renderer cost pass (ADR 0157 point 4).

## Not met / not done

- Integrated Intel and phone rows: no hardware. `scripts/measure-devices.ts` measures them the same way.
- The governor in a live frame loop on the M2: not run (frames stop when the window is out of view).
- The glass blur cost on the M2: not measured (same reason).
- `medium` at the half-resolution rung reads 16.3 ms at the pad: still over 13.3. The ladder order is unchanged.

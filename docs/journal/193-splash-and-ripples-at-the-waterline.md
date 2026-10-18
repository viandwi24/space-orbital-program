# 193 — Splash and ripples at the waterline

**Plan:** [plans/193-splash-and-ripples-at-the-waterline.md](../plans/193-splash-and-ripples-at-the-waterline.md) · **Session:** Agent 1 (Lead), 2026-10-18 · **ADRs:** [0182](../decisions/0182-buoyancy-water-seabed-slices-wet-landed.md), [0072](../decisions/0072-lakes-in-the-height-function-flowing-rivers-and-shore-waves.md) · **Research:** none

**Status when written: criteria met on the CPU; the GPU cost and the look are not checked.**

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/effects/waterline.ts` | `waterlineCrossings` (a part's bounding sphere spans `|r| = R` over water, after the body rotation), `rippleRing`, `splashState`, `WaterlineEffects` (a pool of 48 rings; a splash ring and a spray cone per fresh entry) |
| `packages/renderer/src/environment.ts` | `waterAt`: the same terrain field the sim's `waterUnder` reads |
| `packages/renderer/src/scene.ts` | `placeWaterline` on each sync: vessels of the home body within 300 m of the water plane, outside map view |
| tests | renderer `waterline.test.ts` (6) |

## What surprised me

- **Scene tests count the scene's `Group` children as vessels**, so the effect root is a plain `Object3D`.
- **No ADR holds an effects budget.** ADR 0090 is the hills ADR. The criterion is read as the CPU cost, 0.019 ms per frame for 16 parts on an Apple M5, plus a hard cap of 16 parts × 3 rings.
- **Not looked at in a browser.** No e2e path flies to the water, and building one (a splashdown) was outside this batch. A visual check is a follow-up.

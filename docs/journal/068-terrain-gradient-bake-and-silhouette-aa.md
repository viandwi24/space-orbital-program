# 068 — Analytic terrain gradients for the bake (silhouette AA moved to 133)

**Plan:** plans/068-terrain-gradient-bake-and-silhouette-aa.md · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-17 · **ADRs:** [0116](../decisions/0116-analytic-terrain-gradient-in-forward-mode.md) (new), [0072](../decisions/0072-lakes-in-the-height-function-flowing-rivers-and-shore-waves.md), [0044](../decisions/0044-terrain-patches-camera-centred-and-hi-lo-bake.md), [0142](../decisions/0142-sites-terrain-seed-zones-and-placement.md) · **Research:** none

**Status when written: gradient half met; the silhouette half moved to draft 133.**

## What was done

| Where | What |
|---|---|
| `packages/core/src/terrain-gradient.ts` | `terrainHeightAndGradient` (forward mode through every stage of `terrainHeight`), `terrainSlopes` (the rise over run a texel stores) |
| `packages/renderer/src/shaders/terrain.glsl.ts` | `heightGrad` (the GLSL twin, `vec4`); `terrainTexel` uses it; the old forward differences and a no-gradient program stay behind `TERRAIN_FD_GRADIENT` / `TERRAIN_NO_GRADIENT` for measurements |
| `packages/renderer/src/planet.ts`, `renderer.ts` | `debug.bakeMode(rebake, gradient)`: bake every frame and pick the bake program, for frame benchmarks |
| tests | `packages/core/test/terrain-gradient.test.ts` (4); `hills-ground.test.ts` pins the new bake programs |

## Numbers

Bake (cube and both patches) on the M5, `high`: 18.2 → 8.0 ms; `medium`: 7.9 → 3.3 ms. Steady frames unchanged. Core gradient against central differences: worst 2.7e-5 (Legacy) and 1.1e-7 (seed 7, two zones). Full tables in the plan's Log.

## Decisions and surprises

- **Forward mode rather than hand-derived formulas per stage.** Every quantity carries its gradient, so the derivative follows the code; the hash count stays at 8 per noise, which is why the bake costs about 1.6 single evaluations instead of 3.
- **The map's value keeps the hardware-filtered fetch**, and its derivative comes from the four texels: the heights the bake stores are unchanged (the parity e2e reads the same numbers), only the gradient source changed.
- **Measuring bakes inside a page:** reading three.js render targets back (`readRenderTargetPixels`) after cube bakes broke the patch framebuffers of the page, so the costs come from frame benchmarks with a "bake every frame" switch, and before/after are two bake programs of one build, not two builds.
- **Pixel diffs cannot judge the shading change:** two captures three seconds apart differ as much from the moving clouds as `fd` against `analytic`; the check is the core test plus a look at the frame.

## Not met / not done

- Silhouette anti-aliasing: draft 133 (why in the plan's Log).

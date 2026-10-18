# 133 — Anti-aliased silhouettes of the planet pass

**Plan:** [plans/133-planet-pass-silhouette-anti-aliasing.md](../plans/133-planet-pass-silhouette-anti-aliasing.md) · **Session:** Agent 1 (Lead), Apple M5, 2026-10-18 · **ADRs:** [0195](../decisions/0195-planet-pass-silhouette-coverage.md) (new), [0053](../decisions/0053-frame-budget-governor-march-prepass-and-terrain-veil.md), [0116](../decisions/0116-analytic-terrain-gradient-in-forward-mode.md) · **Research:** none

**Status when written:**
- The stair steps at a far ridge are more than halved, and the dark crest line is gone.
- **The frame criterion is not met:** +0.29 to +0.75 ms on `high`, against at most +0.3.
- The hills horizon could not be counted.

## What was done

| Where | What |
|---|---|
| `shaders/planet.glsl.ts` | `shadeRay` (the shading of one ray, one call site in a two-pass loop); `marchTerrain` returns the closest approach (`sMin`, `tMin`), refined after a miss by one real height read at a parabola's lowest point; the sea's analytic closest approach; the coverage blend; a crest stepped over is a hit; grazing normals and self-shadow |
| `planet.ts`, `renderer.ts` | the `uSilhouetteAA` uniform (on), `Renderer.debug.silhouetteAA` |
| `terrain-model.ts` | the CPU twin: `MarchResult.closest`, `silhouetteCoverage`, `parabolaMin` |
| `test/silhouette.test.ts` | coverage, the parabola, a bisected skyline on 6+ azimuths from the pad |
| `apps/web/scripts/measure-silhouette.ts` | the screenshots, the 4-sample reference and the frame times |
| `docs/journal/assets/133-*.jpg` | before and after at a far ridge and the hills horizon, 4 × zooms (`133-zoom-*.jpg`) |

## Method

- **Builds.** Two development builds (`__orbital` exists), served by a static server:
  - **base:** HEAD before this plan;
  - **after:** this plan.
- **Browser.** Playwright's Chromium on the Metal GPU (`--use-angle=metal`), headless, viewport 1920 × 1080, pixel ratio 1. The two-stage example sits on the pad. The scenes are pad presets:
  - `pad-low-sun`;
  - `pad-noon`;
  - `horizon`: noon, yaw 2.6, pitch 0;
  - `ridge`: low sun, yaw −1.2.
- **Frame time.** The minimum of six `benchmark(8)` runs, then the minimum over two page loads of each build.
- **Stair-step count.** In boxes that hold only sky over a silhouette:
  - In each column, the reference edge is the largest one-row jump in the reference.
  - A pixel within two rows of it counts when its luminance is off the reference by more than a quarter of the sky-to-ground contrast.
  - The reference is the same frame at ratio 2, box-filtered down.

## Results

| Scene | `high` base → after (ms) | `medium` base → after (ms) |
|---|---|---|
| pad-low-sun | 16.46 → 16.94 (+0.47) | 12.18 → 12.60 (+0.42) |
| pad-noon | 13.80 → 14.38 (+0.57) | 10.29 → 10.66 (+0.37) |
| horizon | 13.78 → 14.06 (+0.29) | 10.31 → 10.64 (+0.32) |
| ridge | 15.52 → 16.27 (+0.75) | 11.54 → 11.94 (+0.40) |

- **Run-to-run spread.** Base runs on other loads differed by up to 0.3 ms on this shared machine; the base pad-low-sun read from 16.05 to 16.70.
- **Coverage on against off.** Within one build the difference is 0.0 to 0.1 ms. The remaining cost is in the march bookkeeping and the larger program.
- **The `high` budget, 16.7 ms.** pad-low-sun reads 16.94. The base is 16.46 by this method, which reads higher than journal 054's browser pane.
- **Stair-step pixels at the far ridge:** 146 → 64, 150 → 70 and 150 → 74 on three loads, a ratio of 0.44 to 0.49.
- **The hills horizon.** At ratio 2 the terrain detail changes, so the reference's silhouette moves by several pixels. The count there (1.07 to 1.12) measures that move, not aliasing. The zoom `133-zoom-horizon.jpg` shows the steps softened.
- **Terrain parity e2e.** It passes against the after build (`E2E_DEV_HOOKS=1`, `E2E_PORT` of the dev server).

## What surprised me

- **The dark dashed line along every ridge was not aliasing.** It was there with the coverage off, and it had two causes:
  - Grazing rims are shaded edge-on and self-shadowed.
  - Rays cross a thin crest between two march samples and shade the sea-level sphere behind it as water.

  The second cause shows in the CPU twin as a negative closest approach on 5 of 10 bisected skyline rays.
- **A shared GLSL chunk broke the prepass silently.** `marchTerrain` lives in `terrainMarchGLSL`, which the march prepass includes. Using `uSilhouetteAA` there without declaring it in that chunk failed the prepass's compile. Every pixel then marched from the camera, and the frame cost +2 to +3 ms. The only sign was one console line. Declaring the uniform in the shared chunk fixed it.
- **Refining inside the loop cost about 2 ms.** A parabola and a height read inside the march loop cost that even when switched off. Keeping only the closest sample and its neighbours in the loop, and refining once after it, brought the cost back down.
- **Calling `shadeRay` from one call site in a two-pass loop** did not measure differently from two call sites.

## Left open

- The `high` cost is +0.3 to +0.75 ms, against at most +0.3.
- The hit side of an edge is still hard. It would need a march past the hit point.
- A count method for the hills horizon whose reference does not move.

## 2026-10-19: the frame cost, measured again (ADR 0211)

**The quality governor was on in the first measurements.** It changes the preset or the render scale between runs. With it off (`orbital.graphics.auto = off`), each variant was built and measured against the base build, alternating, three runs, minimum of six `benchmark(8)` per scene, `high` (`apps/web/scripts/measure-silhouette.ts`).

| Variant | pad-low-sun | pad-noon | horizon | ridge |
|---|---|---|---|---|
| all of plan 133 compiled out | −0.12 | +0.01 | +0.09 | −0.00 |
| as committed on 2026-10-18 (blend in a two-pass loop) | +0.44 | +0.39 | +0.39 | +0.51 |
| cheaper bookkeeping in the march loop | +0.80 | +0.68 | +0.57 | +0.60 |
| **no second pass (shipped)** | +0.18 / +0.05 | +0.04 / +0.01 | +0.23 / +0.16 | +0.18 / +0.21 |
| no bookkeeping, two passes | +0.52 | +0.48 | +0.43 | +0.35 |
| a loop bound that cannot be unrolled | +0.36 | +0.32 | +0.31 | +0.41 |
| a light second pass (no clouds, aurora, shafts) | +0.57 | +0.50 | +0.52 | +0.65 |
| the quad neighbour's colour (`dFdx` / `dFdy`) | +0.98 | +0.79 | +0.79 | +0.89 |
| the shipped variant with a plain call instead of the one-pass loop | +0.65 | +0.50 | +0.48 | +0.64 |

The shipped variant was measured twice; its row gives both runs.

What these show:

- **Off and on cost the same in every variant.** The cost is the program's size and registers, not the work on the edge pixels.
- **The second shading is what costs.** No form of it fits 0.3 ms, so the blend is deferred to a resolve pass (ADR 0211).
- **The shipped variant keeps a one-pass loop.** A plain call of the same function measured +0.5 ms. The GPU compiler's register allocation follows the form of the code, so the form stays as it measured.
- **Stair steps.** The quad-neighbour blend gave 0.62 of the count at the ridge. The shipped variant has no blend, so the stair steps are back to one pixel.
- **The dark crest line.** Its two fixes, a crest stepped over taken as a hit and the grazing normal, stay. In the frames of this run the line did not show with the switch off either (the scene state differs between page loads), so this run gives no visual comparison of them.

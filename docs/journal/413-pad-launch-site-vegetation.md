# 413 — The pad's frame

**Plan:** [plans/413-pad-launch-site-vegetation.md](../plans/413-pad-launch-site-vegetation.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0370 (0364, 0368, 0369) · **Note:** [refs/graphics-v2/07-look-costs.md](../../refs/graphics-v2/07-look-costs.md)

## What was done

| Where | What |
|---|---|
| `renderer/site.ts`, `site-meshes.ts`, `environment.ts` | tuft cells 8 x 8, shuffled; `tuftDensity`; `thinTufts(camera)` every frame |
| `renderer/renderer.ts`, `renderer-facade.ts`, `scene.ts`, `environment.ts` | `setLookOff` for site, vessels, vegetation, trees, tufts, shadows; the rocks switch only touches the rocks (it had leaked) |
| `apps/web/scripts/measure-looks.ts`, `profile-frame.ts` | a fresh page for each look, mean and median in the table; the profiler starts the booster from the Hangar again |
| `refs/graphics-v2/07-look-costs.md` | the tables |
| tests | `renderer/test/site.test.ts`: density is monotone, under half the lawn for a camera on the pad |

## Findings

- At the pad the main thread was idle 36 of 48 ms (a CPU profile, 10 ms busy a frame): the frame is waiting on the GPU, not on script.
- One look at a time off, the launch site is the only thing that moves the pad (20.9 to 16.7 ms mean); in it, the vegetation. None of the looks of plans 397 to 406 cost anything measurable at the pad. The pad's cost scales with the preset (p95 49, 35 and 24 ms at High, Medium and Low) and hardly with the pixel ratio (49 against 42 at ratios 2 and 1): it is draw and vertex work, not fill.
- The p95 of the frame interval moves in 16.7 ms steps; the mean and the share of frames over 16.7 ms are what show a 1 ms change.
- After the thinning: pad mean 18.2 ms, 9 % of frames over 16.7 ms.

## Not done

- The pad under 16.7 ms at p95: the trees (0.6 ms, 2 000 of them, every one lit), the planet pass at the pad and the site's other meshes remain.
- The 12 km, orbit and Space Center cells were not re-run after the thinning (the lawn is out of range there).

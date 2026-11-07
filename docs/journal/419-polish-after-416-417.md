# 419 — Polish after 416 and 417

**Plan:** [plans/419-polish-after-416-417.md](../plans/419-polish-after-416-417.md) · **Session:** Worker D, 2026-11-08 · **ADR:** [0375](../decisions/0375-keep-three-raw-webgpu-for-hot-passes.md) (addendum, points 11 to 13)

The coordinator found three artefacts in the screenshots of 416 and 417. Screens: `docs/journal/assets/419-before-*` and `419-after-*`. The before shots are the committed 416 and 417 ones (the same code paths; the Low 300 m and 3 km ones were re-taken on the tree at `aaa5e8c2`); the after shots come from `capture-416.ts` and `capture-417.ts` unchanged.

## What was done

| Artefact | Cause found | Fix |
|---|---|---|
| Black blots on the cliffs | The terrain shadow march (`terrainShadow`, 3 steps at Low, 5 and 8 above) clamps a step's height over the ground to a 0.12 penumbra with a 0.05 bias, so one step landing in a terrace gave a full 0 for the sun. It is not only Low: the committed High 3 km shot has the same blots. With the march turned off (floor 1) the plateau blots vanish and the cliff walls stay dark (that is the sun's cosine, not the march) | `TERRAIN_SHADOW` in `terrain-model.ts` (width 0.3, bias 0.15, floor 0.45), read by the TSL pass and the GLSL twin. A shadow keeps 45 % of the sun and has a wide penumbra. No new sample, so no cost. Applies at every preset |
| City lights in blocks | The 2 km sparkle was a value noise on its own axis-aligned lattice, thresholded hard (0.5 to 0.74, floor 0.2): square cells | `night-lights.ts` (TS twin, GLSL, TSL): the sparkle is read at the point moved by the town and city noises that are already computed (`LIGHTS_WARP` 3 km), so its cells bend into blobs; its range is 0.3 to 0.8 with a floor of 0.4; the cities' range is 0.55 to 0.85 and the core weight 1.0 (town 0.3), so cores are brighter than suburbs; the roads are a little wider and stronger (0.04, 0.3). Bake only, plus the same formula in the pass where the bake is not read: no new noise evaluation |
| Cirrus blur from orbit | The old cirrus layer (10 km up) drew under the 416 shell | `CIRRUS_FADE` (`cloud-far.ts`): the cirrus weight is 1 up to 40 km of camera altitude and 0 from 110 km, times the shell's on/off switch (so `setLookOff('farShell')` keeps it). Above 110 km its density is not evaluated at all, so the orbit view spends less. Ground and aircraft keep the cirrus |

Tests: `night-lights.test.ts` (the density is soft and graded on settled ground), `cloud-far.test.ts` (the gate), `ground-relief.test.ts` (the floor, the twin's text).

## What surprised me

- The blots are not a Low-only artefact (the plan's guess): High's 8 steps give the same blots on the same plateau, so the cure is the same shape for all presets.
- The dark crevices of the foreground at 300 m (the terrace risers, luma about 19, a few black pixels) do not move with the march (floor 1 leaves them): they are walls facing away from the sun with only the sky's ambient on them. They are thin lines, not ovals, and are left as they are (see Not done).
- The first lights try, with only a softer threshold, still showed cells; the warp is what removes them. A CPU render of the density (`nightLights` over a 300 km patch at 1 and 2 km a pixel, old against new) was the quick way to tune it before looking in the game.

## Verification

- **Screens.** `419-before-*` and `419-after-*`: `{webgpu,webgl}-{low,high}-{day400,night400}` (lights and cirrus), `{low,high}-{hill300,hill3k}` (cliffs, WebGPU). From 400 km by day the streaky layer is gone and the clouds read as one layer with relief, at both presets and both backends; at night the lights are blobs with brighter cores and thin roads, no square cells, at both presets and both backends. On the 3 km view the oval plateau blots are soft grey patches (darkest 0.5 % of the plateau crop: luma 57 to 106 at Low, 50 to 100 at High). At 300 m the thin crevices stay as dark as before (see Not done).
- **A/B** (`measure-416.ts`, interleaved base and branch dev servers, headed Chromium on the M5, WebGPU, governor off, 15 s a cell after an 8 s warm-up, 2 runs a cell, `/tmp/orbital-measuring` held by "Worker D 419 A/B"; load averages 3.38 before and 3.55 after the run, other workers running). Base is a copy of the tree at `aaa5e8c2`:

| preset | view | side | mean ms | p95 ms | worst ms | GPU ms (runs) |
|---|---|---|---|---|---|---|
| low | pad | base | 8.33 | 9.30 | 9.4 | 0.36, 0.36 |
| low | pad | new | 8.33 | 9.30 | 11.1 | 0.39, 0.37 |
| low | orbit | base | 8.33 | 9.30 | 9.5 | 0.29, 0.28 |
| low | orbit | new | 8.33 | 9.30 | 9.4 | 0.26, 0.31 |
| high | pad | base | 11.26 | 16.70 | 25.7 | 4.07, 4.19 |
| high | pad | new | 11.31 | 16.75 | 17.8 | 4.04, 4.15 |
| high | orbit | base | 8.39 | 8.95 | 165.7 (one frame) | 1.66, 1.57 |
| high | orbit | new | 8.34 | 9.30 | 16.6 | 1.60, 1.65 |

  Every difference is inside the run-to-run spread and under +0.2 ms (High pad +0.05 ms mean). The High pad cell is slower than the 8.33 ms vsync on both sides; that is the tree's own state, not this plan's.
- `probe-dusk.ts` (High, WebGPU): pipelines before dusk 92, after 92, 0 built. `probe-textures.ts low --gate` and `high --gate`: gate ok, no pipeline over 15 sampled textures, none failed.
- `bun test packages/renderer`: 1093 pass, 0 fail. `bun run lint`, `bun run docs:check` ok. `bun run typecheck` ok once the sandbox bundles exist (`bun run build:sandbox` in `apps/web`; without them `script-sandbox-web.ts` fails its asset typing, on a clean tree too).
- The M2 and Windows are `[manual]`.

## Not done

- The foreground crevices at 300 m (terrace risers facing away from the sun, ambient light only, a few black pixels) are unchanged: they come from the sun's cosine, not from the shadow march, and a fix would mean a wrapped diffuse term in the terrain shading for every ground pixel. That is a look decision for the owner, not a polish of 417's blots.
- The cirrus is not folded into the shell's detail: it fades out (40 to 110 km). Between 12 and 40 km both layers are drawn as before.

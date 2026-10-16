# 025 — Visual: environment follow-ups

**Plan:** plans/025-environment-follow-ups.md · **Session:** environment-2 session (Claude, 2026-10-16) · **Date:** 2026-10-16 · **ADR:** [0030](../decisions/0030-launch-site-coordinates-and-ground-detail.md)

## What was done

| Area | Change |
|---|---|
| Sim (`packages/sim`) | `placeOnSurface` takes body-fixed latitude/longitude (`omega * t` rotation of the up vector). New `test/launch-site.test.ts` (10 tests). No protocol change. |
| Renderer inference | `SceneModel.lockLaunchSite` and `LAUNCH_SITE_MAX_ALTITUDE` deleted; `scene.test.ts` now checks a vessel at the turned +X axis is under the pad; `site-placement.test.ts`. |
| Dark lines | They were shadows of the 10 cm lightning masts, light poles and the windsock pole at the 30 degree morning sun (and a vertical one at liftoff). Thin steel is a separate mesh that never casts (`SiteParts.thin`). |
| Ground shader (`shaders/planet.glsl.ts`) | Grass blades/clumps/gaps below 3 m per pixel, mown stripes, hill shading (finite differences, 500 m to 2.5 km from the pad, off above 160 m per pixel), forest crowns, field plots with hedges, rivers, coast displacement by map gradient with antialiased edge, foam, wet sand, floodlight term at night. |
| Launch site | `site-geo.ts`, `site-buildings.ts`, `site-vegetation.ts`, `weathering.ts`; `site-meshes.ts` merges one mesh per material. Gabled hangar (door texture, pilasters, clerestory glass, lights, emblem, annex), control centre and office with glass ribbons, containers, vehicles, fences, tower platforms, ladder, umbilicals, floodlit masts, tanks with ladders, weathering on every material, glass with image-based reflections. |
| Vegetation | Trees with displaced smooth canopies, leaf mottling, wind and per-instance colour; shrubs; five groves near the pad; instanced grass tufts (9 blades; 0 / 10 000 / 28 000 by preset); only trees within 170 m cast shadows. |
| Night | Four point lights at 0 cd by day plus the same lamps in the ground shader. |

## Manual run

Built-in browser (Chromium in the Claude desktop app, Apple M5), own Vite server on port 5184 with a temporary config that did not watch other sessions' routes (deleted with the launch entry). The pane was hidden, so `requestAnimationFrame` did not run: the capture helper calls `renderer.update(snapshot)` and `render()` itself and posts `canvas.toDataURL()` to a throwaway Bun receiver (killed). The hidden pane's resize observer resets the canvas to 1 x 1, so the helper calls `resize(1920, 1080)` first. Preset `high`, 1920 x 1080, device pixel ratio 1, HUD not included. The vessel is the plan-008 two-stage stack on the pad.

| Screenshot (`docs/journal/assets/`) | Before (019/020) | How |
|---|---|---|
| `025-pad-noon`, `025-pad-low-sun`, `025-pad-morning`, `025-pad-close` | `019-pad-noon`, `019-pad-low-sun`, `019-pad-morning`, `019-pad-close` | the real sim with the 019 camera presets |
| `025-pad-night` | none | real sim, preset `pad-night`, 260 frames of exposure adaptation |
| `025-site-overview` | none | real snapshot with the vessel moved to 60 m above the site (synthetic position) |
| `025-grove-lawn` | none | synthetic position 70 m south and 85 m east of the pad, 2 m up |
| `025-ascent-3km`, `025-ascent-12km` | `019-ascent-20km` | **synthetic positions** straight above the pad (a copy of the real snapshot with the position scaled) |
| `025-coast-6km`, `025-orbit-coast`, `025-orbit-rim` | `019-orbit-day-rim` | **synthetic positions** over a coast found with `generatePlanetMap` (lat -0.44 rad, lon 0.06 rad) |

## Frame times (1920 x 1080, device pixel ratio 1, M5)

Same method as journal 019: "thr" = ms per frame with frames pipelined (150 frames after warm-up, mean of two runs), "sync" = one frame at a time with a pixel readback (80 frames).

| Scene | low thr / sync | medium thr / sync | high thr / sync |
|---|---|---|---|
| pad (real sun) | 5.2 / 7.2 | 9.4 / 12.4 | 11.6 / 16.5 |
| 20 km ascent | 4.4 / 9.5 | 7.8 / 12.6 | 8.9 / 13.6 |
| 100 km orbit | 4.7 / 9.8 | 8.4 / 12.9 | 10.1 / 14.2 |
| (019: pad / 20 km / 100 km, thr) | 4.1 / 3.1 / 3.4 | 8.2 / 6.1 / 6.8 | 9.9 / 7.8 / 8.2 |

`high` pad costs about 1.7 ms more than in 019: removing the whole site saves 3.2 ms, of which the grass tufts are 1.4 ms and all instanced vegetation 2.2 ms; the rest of the pad scene is unchanged. The sync metric of `high` at the pad (16.5 ms) is at the 16.7 ms limit on an M5, which is considerably faster than the M1/M2 of ADR 0025: not measured, so `selectPreset` still gives M1/M2 `medium`, and **nobody should read these as proof for the budget machine**. Two earlier runs gave 3x worse numbers for every scene including the 100 km orbit; the second browser tab (the VAB session) was drawing at the time and removing the point lights changed nothing, so those were contention and are not reported.

## Surprises (read before touching the shaders)

- **`patch` is a reserved word in GLSL ES 3.00** and a template-literal shader must not contain backticks, even in comments: both took the whole planet pass down (black ground) on first load.
- **Per-octave amplitude `lam * k` gives the same slope at every scale**; the first relief pass painted rock and shadow everywhere at 12 km. Amplitude now falls with `lam^1.5`, and relief fades out above a 160 m pixel footprint, where single value-noise octaves show their lattice as blocks.
- **A fixed elevation offset of the coast is a speckle generator**: the map is 3.7 km per texel, an offset of 0.16 elevation units moves the shoreline by kilometres where the gradient is small. Offsets are now `0.7 * lam / gradient`.
- **Field hedge lines alias into a grid** at 20 km: they fade out above 5 to 30 m per pixel.
- `mergeVertices` needs normals and uv removed first, `IcosahedronGeometry` is already non-indexed, and a hidden pane resets the canvas to 1 x 1 (see research).
- The other session (plan 022) added `packages/renderer/src/vab/` and an `index.ts` export while this plan ran; `bun test packages/renderer` failed on its unfinished hangar test for a while and then passed.

## Test output

```
bun test packages/sim/test/launch-site.test.ts      10 pass (6 fail with the fix removed)
bun test packages/renderer                          147 pass
bun test                                            659 pass, 0 fail (83 files)
bun run typecheck / build / docs:check              green
```

Mutation checks: placement default moved by 0.001 rad (scene test fails), sim fix reverted (6 of 10 launch-site tests fail).

## Self-review against `product/visual-direction.md`

Would a player who knows KSP/KSP2 take these screenshots seriously? Honest answers.

| Direction | Verdict |
|---|---|
| Sky and atmosphere | Unchanged from 019 and still good; low sun is golden at the pad (`025-pad-low-sun`). Haze at 3 to 10 km looks milky over desert and sea (`025-coast-6km`): land reads like cloud. Not tuned here. |
| Planet that reads as a planet | Much better from 100 km (clean coast, shallow water, desert, `025-orbit-rim`) and at 3 to 12 km (forest crowns, rivers, plots; `025-ascent-12km`). **Still falls short:** no mountain silhouettes or hills against the horizon (relief is shading only, ADR 0030), forests are one texture, land at 6 km under haze is washed out, the cloud shell has no layers. |
| A launch site that gives scale | A place now (`025-site-overview`, `025-pad-close`): hangar with a door, control centre with glass, vehicles, containers, fences, floodlit masts, weathered steel, lit at night. **Still falls short:** every building is a box with trim, there is no ground clutter on the pad (cables, drains), the tower is a lattice of boxes, nothing moves, windows do not glow at night. A KSP2 player will see good placeholder art, not a hand-made KSC. |
| Lawn and trees | Grass has blades, stripes and tufts and holds up at 2 m (`025-grove-lawn`); trees are smooth leafy blobs. **Still falls short:** tufts are the same shape everywhere and thin out in a ring around the pad; tree silhouettes are still blobs and pines are cones; there are no flowers, dirt tracks or wear. |
| Lighting | One sun with shadows, PBR, bloom, reflections in glass, floodlights at night (`025-pad-night`): good. The vessel is the plan-008/020 stack. |
| Release readiness | Not there: terrain geometry, cloud layers, water motion and M1/M2 measurements are open (draft plan 027); `high` at the pad is at the budget limit on a fast GPU. |

What still looks like a debug view: the flat horizon (no terrain silhouette), the cloud shell as the only weather, and the river/field/forest detail turning into haze at 3 to 10 km. What is surprisingly good: the 100 km coast and shallows, the 2 m grass, the night pad.

## Not done / follow-ups

Draft plan 027: terrain heights and LOD, cloud layers and haze tuning, water waves, animated site details and glTF swap, M1/M2 and Intel measurements, derivative-based noise, mobile.

## Commits

- `fix(sim): place vessels at body-fixed launch-site coordinates`
- `feat(renderer): environment detail ...` and `docs(plan-025): complete` (see `git log`).

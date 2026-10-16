# 031 — Physical terrain heights and the look problems that came with them

**Plan:** plans/031-physical-terrain-and-sky-volumes.md · **Session:** physical-terrain session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0043](../decisions/0043-physical-terrain-one-height-function-in-core.md), [0044](../decisions/0044-terrain-patches-camera-centred-and-hi-lo-bake.md)

## What was done

| Area | Change |
|---|---|
| Core (`terrain.ts`, `planet-map.ts`, `noise.ts`) | The height function, the biome map and the noise moved from the renderer to `@orbital/core`. `createTerrainField({ radius, latitude, longitude })` is lazy (the canonical 1024 x 512 map, 0.3 s on first query). The function changed to be physical: soft ridge, polynomial smooth maximum, a 1.9 km domain warp of the map lookup (ends the coast stair steps), a scenic massif ring moved in (12 to 21 km). `TerrainField` and `VesselSnapshot.terrainHeight` are additive; API 0.1.9. |
| Sim (`terrain.ts`, `frames.ts`, `modes.ts`, `orbit.ts`, `vessel.ts`, `snapshot.ts`) | `createSim({ terrain })` (a field or a function of the root body). The ground tile is the tangent plane of the terrain under the centre of mass (central difference over 4 m), the tile band, ballistic debris, the rails reaper and `isStableOrbit` measure altitude above the terrain, `placeOnSurface` stands the vessel on the plane with its nose along the normal. Slope behaviour is the rigid body's (no extra rule). The worker passes `createTerrainField`. |
| Renderer (`terrain-patch.ts`, `planet.ts`, `shaders/*`, `environment.ts`) | The camera bubble is gone. Two camera-centred gnomonic patches (4 m texels over 4 km, 32 m over 33 km on `high`) are baked in 32-bit floats from the same function and blended into the cube map; the cube keeps hi/lo half floats. The camera is held 0.5 m above the terrain. The march got an expanded clearance (float32), a local slope bound, a growing step floor and Illinois refinement so a camera lying on a hillside sees the horizon. |
| Presets | `terrainPatch` (512 / 512 / 1024). March steps unchanged (20 / 32 / 48). |

## Tests (what proves what)

- `core/test/terrain.test.ts` (15): the 027 height-function tests moved here (deterministic, slope <= 0.95, bounded, zero over ocean and coasts, exactly zero within 5 km of the site, flat zone is the mask, monotone ring, reachable mountains), the field equals the function, the warp is bounded and smooth, and the grid tests: bilinear interpolation of a 4 m grid is within 5 cm and a 32 m grid within 1 m over the massif (3 x 3 000 points, maxima).
- `sim/test/terrain.test.ts` (13): rest on a 30 degree ramp with the flat bottom on the plane (root within 0.15 m of the flat-ground distance), slide at 42 (friction 0.8 gives 38.7), probe rests at 20 and tips at 30, two-stage tips at 10, lander with legs rests at 10 and tips at 20, tile band 3 km up on a plateau, impact rule on a slope (11 m/s breaks a 10 m/s pod on flat ground, not on a 30 degree slope; 13 breaks it there), surface rails on a ramp (1e5 s warp holds the body-fixed position to 1e-6 m; wake: under 5 cm in 5 s, no damage), placement on a hill's peak and flank, the pad vessel equal to the no-terrain one to 1e-6 m, on-rails debris destroyed at a 3 000 m plateau (airless test body), byte-identical snapshots and worlds over procedural terrain. Mutation check: forcing the plane back to the sphere fails 9 of the 12 original tests.
- `renderer/test/terrain-patch.test.ts` (12): patch projection round trip 1e-9, frames are the shader basis, texel sizes, weights monotone, re-centring keeps the camera in the core over 4 000 random-walk steps, patch grids built from the real geometry reproduce the function (fine 5 cm, mid 1 m), the camera clamp (1 000 positions), shader constants generated from core, preset table.
- `renderer/test/terrain-model.test.ts`: march against brute force on 200 rays with the global and the local slope bound, skyline from the pad at least 6 degrees (7.1).

```
bun test                  959 pass, 1 skip, 0 fail (118 files)
bun run typecheck         all packages and apps/web green
bun run build             green
bun run docs:check        OK
```

## Manual run (built-in browser, Claude desktop, Apple M5)

Own Vite server on port 5193 with a temporary config (deleted), screenshots POSTed from the page to a dev endpoint (deleted), the pane hidden so frames were driven from the console as in journals 019 and 027. `docs/journal/assets/031-*.png`: `031-landing-4-rest.png` and `031-landing-3-touchdown.png` (a lander dropped at 0.5 m/s onto a 4.6 degree hillside 20 km from the pad, 901 m up, legs deployed: on surface rails after 2 s, root part 10.81 m above the terrain along the radial where a flat pad gives 10.4; the sim's terrain height and the drawn ground agree to the readback below), `031-hill-lander-b.png` (a lander placed on the 9.7 degree flank at 924 m), `031-after-pad-east.png`, `031-after-pad-low-sun.png` (the massif behind the hangar), `031-after-hor3.png`, `031-after-hor12.png` (3 and 12 km up, looking at the massif).

**Parity.** The patches read back from the GPU (float32) against `terrainHeight` in float64 evaluated in the page, 400 random texels: fine patch mean 0.029 m, worst 0.201 m; mid patch mean 0.045 m, worst 0.806 m. The plan asked for 0.1 m; the float32 floor of a noise lattice at 600 km coordinates is why it is not met (ADR 0044). The interpolation error of the grids themselves is the Bun-tested 5 cm and 1 m.

**Frame times** (1920 x 1080, ratio 1, `benchmark(60)` twice averaged, throughput only; sync not re-measured). Each preset on a page whose shader text had been loaded three times (the hidden pane runs programs from a first or second load at 2 to 3x: low measured 27, 27, then 9 ms at the pad). The machine was slower than during plan 027 (the pad without terrain measured 14.3 ms on `high` against 027's 12.8 for the whole frame), so compare the "terrain cost" column, which is the same frame with the march switched off:

| Scene | low | medium | high | terrain cost (high) | 027 (low / medium / high) |
|---|---|---|---|---|---|
| pad, real sun | 9.2 | 14.1 | 16.0 | +1.7 | 6.6 / 11.1 / 12.8 |
| 3 km up, horizon | 8.4 | 12.1 | 12.9 | | 5.7 / 8.7 / 9.2 |
| 12 km up, horizon | 5.6 | 8.7 | 9.3 | | 4.2 / 6.7 / 7.2 |
| hillside, camera on the ground | 12.9 | 17.3 | 18.6 | +8.9 | not possible (bubble) |

`high` at the pad is 16.0 ms against 12.8: 1.7 ms is the march (rays now start at the camera instead of jumping over the bubble), the rest is the machine of the day. **The hillside is the expensive case**: the march is 8.9 ms of the 18.6 ms frame on `high` (see "Where the time goes"). It stays inside 60 Hz on the M5 only; M1/M2 and Intel were not measured (none here) and draft 038 keeps that item.

Where the time goes (found by switching things off one at a time): the cube/patch fetches are not the cost (patches on, off, cube only: all 21 ms before the Illinois change); the grazing rays near the horizon are (steps times the look-inside samples). Changes that bought it back: the local slope bound and step floor growth (step counts), two instead of three look-inside samples, Illinois instead of 10 bisections (16 to 9 ms), the one-fetch height read without decoding a direction.

## Surprises (read before touching the terrain)

- **Planar-looking cracks and terraces came from float32, not from the height data.** First the cube's hi/lo half floats filtered in half precision (0.5 m steps every 16 m of height: patches are float32 for that); then `length(p) - R` at 600 km quantises to 6 cm and every grazing ray stair-stepped (expanded clearance). Both showed as thin cracks showing the far hills through the ground.
- **`patch` is a reserved word in GLSL ES 3.00.** A parameter named `patch` failed the whole planet pass compile (the plan-025 note about `patch` was already in `three.md`).
- **48 steps at a 5 % floor reach 240 m**: a camera lying on the ground saw the sea beyond a short plain until the step floor grew and the slope bound became local. The old bubble had hidden it by jumping 1.8 km ahead.
- **A `max` of two smooth fields is a crease.** The range mask and the massif met in a crease that the 4 m grid test found at 0.27 m; a polynomial smooth maximum fixed it (and the 32 m grid from 2 m to 0.07).
- **Placing a vessel upright on a slope makes it fall over onto it** (the stack rocks and tips at 10 degrees). `placeOnSurface` now stands it with its nose along the terrain normal; on the sphere and in the flat zone that is the old placement.
- **Fall tests need the centre of mass, not the root**: a `state` placement is the COM, 5 m below the root of the lander; dropping "12 m up" was a 10 m/s landing.
- Page scripts in a hidden pane time out after 45 s while shaders compile; start long work with `.then` and poll.
- The hangar test `hangar.test.ts` (plan 029) failed in the middle of the run (63 meshes against its 60 limit) and was green again at the end; not mine.

## Self-review against `product/visual-direction.md`

| Direction | Verdict |
|---|---|
| Landing | **The release blocker is gone**: the ground a vessel stands on is the ground it is drawn on, legs touch hills, steep slopes slide and tip it, surface rails and wake-up work on slopes, relief no longer melts toward the camera (`031-landing-4-rest.png`, `031-hill-lander-b.png`). **Falls short:** slopes are a rigid plane (a rover or a 30 m ridge crest is not covered), there is no radar altitude in the HUD yet (`terrainHeight` is in the snapshot), ocean is solid, trees and buildings beyond the flat zone stand on the sphere. |
| Planet from the pad | The massif behind the hangar is now a skyline (7 degrees against 6, nearer, with gaps) and the snow line moved up (`031-after-pad-east.png`, `031-after-pad-low-sun.png`). **Still falls short:** from 3 and 12 km the massif is a pale, hazy, almost white wall (`031-after-hor3.png`), the haze model and the scale are the next knobs; the ground detail is smeared on steep faces seen at grazing angles (the noise is planar); the coast stair steps were fixed by the warp but I did not capture a clean before/after. |
| Sky and clouds | **Untouched**: the cumulus is still a flat deck from below and posterised at its edges (visible in `031-after-pad-east.png`). Draft 037. |
| Water, launch site | Untouched (draft 038). |
| Performance | The ground-level view costs 8.9 ms of the `high` frame; pad and altitude views are +1.7 ms. Not measured on M1/M2 or Intel; `selectPreset` unchanged. The first load of a preset in a hidden pane is 2 to 3x slower; a real window was not measured. |
| Release readiness | Physical terrain is ready; the look is **not** at the bar yet: haze on mountains, clouds, grazing-angle ground detail, solid ocean. |

What still looks like a debug view: the posterised cloud deck, the smeared slope textures, the pale mountains. What is surprisingly good: the lander standing on a hillside with the horizon rising behind it.

## Not done / follow-ups

Drafts [037](../plans/037-volumetric-clouds-and-light-shafts.md) (volumetric cumulus, light shafts) and [038](../plans/038-water-site-animation-and-devices.md) (lakes and rivers, site animation, M1/M2 and Intel, mobile, precompile). Smaller items for whoever tunes the look next: radar altitude in the HUD (`VesselSnapshot.terrainHeight`), triplanar or slope-aware ground detail, haze on terrain, coast before/after screenshots, a sync-metric frame-time run in a visible window.

## Commits

`docs(plan-031): refine to ready, ADRs 0043 and 0044, research`, `feat(core): terrain height function, biome map and noise move to core ...`, `feat(sim): terrain option; ground tile follows the terrain ...`, `feat(core): smooth maximum, softer ridge and a closer scenic massif ...`, `feat(renderer): physical terrain on screen ...`, `docs(plan-031): complete`.

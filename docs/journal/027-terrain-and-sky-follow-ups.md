# 027 — Visual: terrain geometry, sky and device follow-ups

**Plan:** plans/027-terrain-and-sky-follow-ups.md · **Session:** terrain session (Claude, 2026-10-16) · **Date:** 2026-10-16 · **ADRs:** [0036](../decisions/0036-visual-terrain-heights-baked-and-ray-marched.md), [0037](../decisions/0037-haze-and-cloud-layers.md)

## What was done

| Area | Change |
|---|---|
| Terrain (`terrain-model.ts`, `shaders/terrain.glsl.ts`, `planet.ts`) | A height function of the body-fixed direction (hills, ranges, a scenic massif 14 to 46 km around the pad, flat within 5 km of the site, zero at coasts) in TypeScript (reference, float64) and GLSL (twin, constants generated from the table). The first frame bakes it into an RGBA16F cube map (height + gradient; 512 / 768 / 1024 per face by preset). The planet pass sphere-traces it per pixel (48 / 32 / 20 steps), refines with 10 bisections, shades by slope and altitude (tree line, alpine meadow, rock, scree, snow line), adds terrain self-shadows (8 / 5 / 0 steps) and crags from the large octaves of the old relief shading. A camera bubble flattens the terrain around a low camera so a vessel never meets a hill the physics ground lacks (ADR 0036). `planet-map.ts`: the site-clear radius grew (0.035 to 0.08 rad) so the pad's landmass is 70 km across. |
| Haze (`atmosphere-model.ts`, `shaders/atmosphere.glsl.ts`) | The scattering layer is 2x the pressure scale height with half the sea-level density (vertical depth, sky colour and sunset unchanged within 5 %); Rayleigh and Mie are accumulated separately (`uMieBoost`); `aerialPerspective` is the CPU twin of the per-pixel veil. 10 km veil over dark ground at 3, 6, 10 km altitude: 0.91, 0.70, 0.72 of the ground before, 0.55, 0.45, 0.51 after. |
| Clouds (`cloud-model.ts`, `shaders/planet.glsl.ts`) | Cumulus (3.5 km) reworked (soft edges that sharpen close up, puffs and billows faded by pixel footprint, opacity `1 - exp(-density)`, undersides, distance fade) plus a cirrus shell (9.5 km, streaks, thin). One atmosphere march with two snapshot distances; the composite has a tested twin. |
| Water (`water-model.ts`, shader) | Seven deep-water components, periodic in 180 s, time wrapped on the CPU, anchor phases in float64, three-pixel fade, slow gain modulation and phase warp, crest foam. |
| Presets / facade | `terrainSize`, `terrainSteps`, `terrainShadowSteps`; `high` gives up 4 view samples, 1 light sample, 2 ground octaves and 1 cloud octave. `Renderer` bakes the cube map at the top of every frame when dirty. `noiseF3` (one hash, three values). |

## Manual run

Built-in browser (Claude desktop, Apple M5, Chromium), own Vite server (port 5187 after 5186 was taken; temporary config `apps/web/vite.terrain.config.ts` that ignores other sessions' files and saves screenshots through a dev-server endpoint restricted to `docs/journal/assets/027-*.png`; deleted with the launch entry). The pane was hidden, so the helper drives `renderer.update(snapshot)` and `render()` itself from the console; `canvas.toDataURL()` is POSTed to the dev server. 1920 x 1080, device pixel ratio 1, preset `high`, HUD not included. The vessel is the plan-008 two-stage stack. Camera presets are the debug rig; **synthetic positions** (a copy of the live snapshot with the position and orientation turned to a latitude/longitude and an altitude) stand in for places the sim would need minutes to reach, as in journal 025.

| Screenshot (`docs/journal/assets/`) | Before (same scene, unchanged code) | How |
|---|---|---|
| `027-after-pad.png`, `027-after-pad-range.png`, `027-after-pad-low-sun.png` | `027-before-pad.png` (and `025-pad-*.png`) | the real sim; sun fixed at 45 degrees / 150 or 6 degrees / 100; yaw 2.4, 3.1 and -0.4 |
| `027-after-hor3.png`, `027-after-hor12.png`, `027-after-hor40.png` | `027-before-hor3.png`, `-hor12`, `-hor40` | synthetic position straight above the pad at 3, 12, 40 km; horizon view |
| `027-after-range.png` | none | synthetic, 13.6 km north of the pad at 900 m, looking at the massif |
| `027-after-coast6.png` | `027-before-coast6.png` | synthetic, coast at lat -25.2, lon 3.4, 6 km, looking down |
| `027-after-orbit-rim.png`, `027-after-orbit-down.png` | `027-before-orbit-rim.png`, `-orbit-down` | synthetic, 100 km over the same coast (rim: camera nearly level, down: nearly nadir) |
| `027-after-orbit-limb.png`, `027-after-orbit-glint.png` | `019-orbit-day-rim.png`, `025-orbit-rim.png` | synthetic, 100 km, day side, camera tilted so the limb is in view |
| `027-after-terminator.png` | `019-orbit-terminator.png` | synthetic, 100 km at the terminator (lon 143), low sun, 200 frames of exposure adaptation |
| `027-after-sea.png` | none | synthetic, 25 m over open water, sun glint |

## Frame times (1920 x 1080, device pixel ratio 1, M5)

Same method as journals 019 and 025: "thr" = ms per frame with frames pipelined (150 frames after 30 warm-up, mean of two runs), "sync" = one frame at a time with a pixel readback (80 frames). Each preset was measured on a fresh page whose shader text had been loaded before (see "Surprises": the first load of changed shader text and any program compiled at runtime was 3x slower in this pane).

| Scene | low thr / sync | medium thr / sync | high thr / sync |
|---|---|---|---|
| pad (real sun) | 6.6 / 7.8 | 11.1 / 13.4 | **12.8 / 15.9** |
| 3 km, horizon | 5.7 / 6.8 | 8.7 / 10.4 | 9.2 / 10.8 |
| 12 km, horizon | 4.2 / 7.2 | 6.7 / 8.4 | 7.2 / 8.6 |
| 100 km, limb in view | 2.2 / 6.3 | 4.1 / 5.4 | 4.5 / 5.7 |
| (025: pad / 20 km / 100 km, thr / sync) | 5.2 / 7.2 · 4.4 / 9.5 · 4.7 / 9.8 | 9.4 / 12.4 · 7.8 / 12.6 · 8.4 / 12.9 | 11.6 / 16.5 · 8.9 / 13.6 · 10.1 / 14.2 |

`high` at the pad is 15.9 ms synchronous against plan 025's 16.5 on the same machine (criterion held), but 1.2 ms more in the throughput metric; the 12 km and orbit scenes are cheaper than 025's 20 km and 100 km scenes because the 025 scenes had the whole cloud shell in view and are not the same framing. Where the budget went (pad, `high`, same session): the two cloud layers cost 2.4 ms (cirrus 0.8) before the work below, the terrain march with its shadows is mostly free at the pad because rays inside the flat zone are not marched. What created the budget: `high` viewSamples 16 to 12 and lightSamples 6 to 5 (-0.9 ms), ground octaves 13 to 11 and cloud octaves 5 to 4 (-0.3 ms), skipping faded-out detail, one noise for the cloud warp (`noiseF3`), thin cloud shade skip (-0.6 ms). **Nobody should read these as proof for the budget machine**: an M5 is much faster than the M1/M2 of ADR 0025 (medium at the pad, 11 ms here, is the number to watch there); `selectPreset` still gives M1/M2 `medium` and Intel `low`. Frame times on those devices were not measured (no such hardware here).

## Surprises (read before touching the shaders)

- **Programs compiled late are slow in the hidden pane.** With the page loaded, changing any define (even `DUMMY: 1`) or `setPreset('medium')` produced a program that ran at 40 ms instead of 14; so did the first page load after any edit of the shader text; a second load with the same text was fast again (35 ms to 13 ms). Looks like a first compile that is cached and optimised later by Metal/ANGLE; not understood. Whether a player switching presets in a visible window sees it is unknown (draft plan 031 item 5).
- **`bun test/some.ts` is `bun test`**: scratch scripts need `bun run <path>`.
- **A fixed 2% minimum step cannot reach 30 km along the horizon in 48 steps**: rays that skim a plain have a clearance that grows like `t^2 / 2R`; the floor is 5 % of the distance and the start of the march jumps over the flat zone. Thin crests were skipped (dotted silhouettes) until the march looks inside floor-limited steps.
- **Contour terraces from orbit** were the 6-step bisection of steps hundreds of metres long: 10 steps.
- **Value noise shows its lattice** in ridged terrain and in clouds ("Minecraft" ridges): octaves are rotated by a fixed matrix between layers (`OCTAVE_ROTATION`, shared by TS and GLSL).
- **Backticks in a GLSL comment inside the template literal** broke the compile again (as in journal 025).
- **A "mountain" half the planet away from the pad is invisible**: the biome map flattened the pad's surroundings to 40 km of island, so noise-only mountains ended up beyond the horizon; hence the scenic massif and the larger clear radius.
- **Snow on high terrain looks like cloud from orbit**; the snow line was raised and only faces below 0.55 to 0.95 slope keep snow, but the confusion between white ridges and white cumulus is still there from far away.
- The other sessions (VAB, scripting, tooling) committed and edited shared docs while this ran; the shared files were edited by line.

## Test output

```
bun test packages/renderer                    199 pass, 0 fail (25 files)
bun test                                      786 pass, 0 fail (94 files)
bun run build                                 green
bun run typecheck                             sim, renderer, scripting green; apps/web fails in
                                              apps/web/src/lib/script-sandbox-web.ts (another session's file,
                                              plan 030 in progress), not touched by this plan
bun run docs:check                            OK
```

Mutation checks: with the site mask removed (early return and multiplication) the flat-zone tests, the "site put on a mountain" test and the skyline test fail; with `STEP_RELAX` at 6 the march-against-brute-force and the step-rule tests fail; with the site multiplication alone removed the "skyline is varied" and march tests fail.

## Self-review against `product/visual-direction.md`

Would a player who knows KSP/KSP2 take these screenshots seriously? Honest answers.

| Direction | Verdict |
|---|---|
| Planet that reads as a planet, from the pad | **Much better**: the horizon has hills and a snow-capped massif behind the hangar (`027-after-pad.png`, `027-after-pad-range.png`) and the sea has swell and sun glitter (`027-after-sea.png`). **Still falls short:** mountains at 20 to 35 km are pale and low (3 to 6 degrees, heavy haze), far smaller than KSP's; trees are still blobs and stand on the sphere; the horizon silhouette is aliased by one sample per pixel. |
| Ascent and 3 to 12 km | Real relief with rock, snow, forest and alpine bands and terrain shadows (`027-after-hor3.png`, `027-after-range.png`); land no longer reads as milk (`027-after-hor3.png` against `027-before-hor3.png`). **Falls short:** the lowland is still the 025 painted map (blurry at 700 m to 3 km), the cumulus shell is a flat bright deck with soft shading and no volume (`027-after-coast6.png`), and the cumulus has no shadow structure on its own sides. |
| Orbit | The limb, ocean glints and islands with snowcaps read well (`027-after-orbit-limb.png`, `027-after-orbit-glint.png`). **Falls short:** the cirrus from 100 km is hair-like streaks over everything (`027-after-orbit-down.png`), white snowcaps look like clouds, coastlines show stair steps at low sun (`027-after-terminator.png`, lower left), islands are a 70 km blob around the pad and 40 km blobs elsewhere. |
| Sky and clouds | Two layers, soft shading, moving cirrus is not animated beyond the slow drift. **Falls short:** no volumetric light, no god rays, no storm or fog layer; at the pad the clouds look like cut-out paper at a glance (`027-after-pad.png`). |
| Water | Waves, glints, foam on crests. **Falls short:** no lakes, rivers do not flow, shore waves do not break, whitecaps are noise-gated. |
| Launch site | Unchanged and still static (draft plan 031). |
| Performance | `high` at the pad meets plan 025's synchronous number on this machine; M1/M2 and Intel were not measured. |
| Release readiness | **Not there.** The terrain is visual only: a vessel lands on the flat sphere while hills stand around it, relief melts toward a low camera, and the silhouette needs anti-aliasing. These are the first three items of draft plan 031. |

What still looks like a debug view: the flat white cumulus deck, the hair-like cirrus from orbit, the blurry lowland between 700 m and 3 km, blob trees, and the stationary launch site. What is surprisingly good: the massif over the pad at low sun (`027-after-pad-low-sun.png`), the sea at 25 m, the terminator over the islands.

## Not done / follow-ups

Draft plan [031](../plans/031-physical-terrain-and-sky-volumes.md): physical heights (sim, ADR 0019), volumetric clouds and light shafts, lakes and river flow, launch-site animation, M1/M2 and Intel measurements and the hidden-pane compile artefact, silhouette anti-aliasing, shader precompile and loading indicator, mobile. Of plan 027's own list, river flow lines were not done (in the plan's scope, moved to 031) and the criterion "[manual] frame times per preset" has M5 numbers only.

## Commits

See `git log`: `feat(renderer): visual terrain heights ... (plan 027)`, `feat(renderer): haze, cloud layers and moving water (plan 027)`, `docs(plan-027): complete`.

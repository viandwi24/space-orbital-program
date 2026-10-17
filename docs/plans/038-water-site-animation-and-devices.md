---
id: 038
title: "Lakes, rivers, shore waves, a living launch site and a faster, visible precompile"
status: done
owner: "water session (Claude, 2026-10-17)"
depends: [031]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 038 — Lakes, rivers, shore waves, a living launch site, a visible precompile

## Goal

What plan 031 pushed out, as far as it can be done and proven without other hardware: lakes that are as solid as the sea, rivers whose ripples flow, shore waves that shoal and break, a launch site with moving parts (swing arms that retract at liftoff, venting steam, blinking beacons, lit windows at night) and a shader precompile that is faster, reports progress and shows a loading indicator. Frame times on an Apple M1/M2, an integrated Intel GPU and a phone, a real `selectPreset` tuning and mobile cannot be done here (no such hardware) and stay in draft 066; physical floating and sinking and the analytic gradient bake and silhouette anti-aliasing are not done and are draft 067 and 066 (reasons in ADR 0072 and the journal).

## Context

- Read: `docs/journal/031-physical-terrain-and-sky-volumes.md` ("Not done"), ADR 0037 (water), ADR 0043 and 0044 (the one height function), ADR 0053 (frame budget amended 2026-10-17: `medium` at most 13.3 ms and `high` at most 16.7 ms sync on the M5), ADR 0055, ADR 0064 (half-resolution rung), ADR 0070, journals 039, 048, 050 and 054 (method and the baseline table), `docs/product/visual-direction.md`.
- The ocean is solid in the sim (journal 031: "ocean is solid"; the height function is exactly zero over water and the ground tile stands on it). Lakes are made as solid as the sea; buoyancy is a larger feature of its own (draft 067).
- Precompile finishes about 84 s after the page loads (journal 054, hidden built-in pane, M5).
- Verified 2026-10-17 (recorded in `docs/research/three.md`, "Plan 038"): flow maps with two half-cycle-offset phases and a triangle weight (Catlike Coding), shallow-water wave speed and shortening (Wikipedia, wave shoaling) and the breaker index 0.78 (McCowan 1894; refined to 0.826 by Yamada 1968; Goda warns it is not a constant), analytic derivatives of value noise (Quilez).

## Scope

**In:**
1. **Lakes** (ADR 0072): basins in the one height function in `@orbital/core` (`terrain.ts`): the height is exactly zero on a lake floor like over the sea (physical in the same sense as the ocean) and the relief around it is capped by a cone that keeps the slope bound; the planet pass draws them as water; none within 30 km of the launch site and the scenery around the pad unchanged.
2. **River flow** (ADR 0072): the ripple normal of the river advects along the river's tangent (the level-set's perpendicular to the gradient, signed toward lower elevation) with two phases half a cycle apart and a triangle weight.
3. **Shore waves** (ADR 0072): swash lines that shoal (shorter toward the shore, `omega / sqrt(g d)`) and a surf band where the wave height reaches 0.78 of the depth, moving shoreward in time, on every coast including lakes (smaller waves on lakes).
4. **Launch-site animation** (ADR 0073): three swing arms that fold away as the vessel lifts (driven by the snapshot: height above the pad, with a slew limit in wall time), venting steam from the tank (a stateless puff function of time), blinking beacons on the masts and tower, lit windows at night.
5. **Precompile** (ADR 0074): progress reporting, an order that puts what a switch needs first, a measured before/after of the total time and of the first-switch hitch, and a small loading indicator in the flight page.

**Out (drafts, with reasons in the ADRs and the journal):** frame times on M1/M2/Intel/phones, `selectPreset` tuning and mobile (no hardware: draft 066); floating, sinking and boats (the sim's contact model, draft 067); analytic noise derivatives for the gradient bake and silhouette anti-aliasing of the planet pass (not cheap: draft 068); a glTF asset swap of the site (plan 026's provider interface); part models and effects (026, 033, 041), HUD (021), VAB (022, 029).

## Design notes

- `core/terrain.ts`: `lakePotential`, `lakeGate`, `lakeLevel`, `lakeCap`, `isLake` (pure; one octave of value noise times a site gate; the cap keeps `TERRAIN_MAX_SLOPE`), twinned in `terrain.glsl.ts` and `planet.glsl.ts`.
- `renderer/water-flow.ts` (flow direction, phases, weights), `renderer/shore-wave.ts` (`surfPhase`, `breakDistance`, swash), `renderer/site-animation.ts` (arm angle and slew, steam puff, beacon, windows), each pure with tests; the shader constants come from them.
- `renderer/site-meshes.ts`: the arms become three groups that pivot about a vertical hinge at the tower's corner; steam is one `InstancedMesh` of camera-facing quads whose per-instance state is a function of time; beacons and lit windows are separate emissive meshes whose colour the site sets from the clock and the sun.
- `Renderer.precompile(onProgress?)`; `apps/web` gets a `PrecompileBadge.svelte` fed by the flight loop.

## Steps

1. Refine (this document, ADRs 0072 to 0074, research); status to in-progress.
2. Lakes in core, with tests; the shader needs no change but a lake factor on the waves.
3. River flow, shore waves: pure modules and tests, then the shader.
4. Site animation: pure module and tests, then the meshes.
5. Precompile: progress, order, measurement; the indicator.
6. Measure: frame table, screenshots, hitch, precompile before and after.
7. Drafts for what is pushed out; docs; commits.

## Acceptance criteria

- [x] **Lakes tested** (`bun test packages/core`): the potential is deterministic and in 0..1, the gate is 0 within 30 km of the site and 1 beyond 80 km; the level's gradient stays under `LAKE_SHAPE.gradientBound` (300 000 pairs, half of them in the gate's ring) and the bound is within 40 percent of the measured maximum; lakes cover 0.5 to 4 percent of the land in at least 20 basins; `terrainHeight` is exactly 0 on every lake sample and never above the cap; the cap is above the highest ground within 28 km of the site (the pad's scenery is unchanged); the cap's slope is at most 0.9 and, where it binds, the ground's is at most `TERRAIN_MAX_SLOPE` (80 000 pairs). All existing terrain and map tests pass unchanged. Result: `packages/core/test/lakes.test.ts`, 7 tests; mutants: no cap fails 3 tests, slope 1.6 fails the cone test; the measured level gradient 5.55e-5 per m against the bound 7e-5; 1.8 percent of the land in 167 basins; cap slope at most 0.9; core 177 pass.
- [x] **Flow tested**: `flowDirection` is a unit tangent, perpendicular to the gradient of the river field, and points toward lower elevation; the two phases' weights sum to 1, are 0 at their reset and have period `FLOW_CYCLE`; advecting by `phase * FLOW_CYCLE * speed` is continuous at the reset of the visible phase (the other has weight 0 there); `bun test packages/renderer`. Result: `water-flow.test.ts`, 6 tests; mutant: offset 0.4 instead of 0.5 fails the weights test.
- [x] **Shore waves tested**: `breakDistance(height, slope)` equals `height / (0.78 slope)`; `surfPhase` is monotone in distance, its crest spacing shrinks toward the shore, it is periodic in time with the wave period and its crests move shoreward; swash stays within its amplitude. Result: `shore-wave.test.ts`, 6 tests.
- [x] **Site animation tested**: arm angle is 0 with the vessel on the pad, `ARM_RETRACTED` when it is `ARM_CLEAR_HEIGHT` above it, monotone in between; the slew never exceeds its rate, retracts faster than it extends and a vessel that is already high finds the arms folded; `steamPuff(i, t)` is deterministic, rises, fades to 0 at its end and repeats with its period; the beacon is lit for its duty share of the period; windows are dark by day and lit on 40 to 70 percent of the panes at night. Result: `site-animation.test.ts`, 8 tests including the pad tracker (a tall vessel's resting height, a new vessel, a far vessel).
- [x] **Screenshots** (JPG 85, 1920 x 1080 where not a sheet) in `docs/journal/assets/038-*.jpg`: a lake and a river from about 2 km; shore waves at two instants; the launch site at liftoff with arms retracting and steam; the pad at night with lit windows; before and after for the lake and river scenes. Result: `docs/journal/assets/038-{before,after}-{lake,river,shore-t0,shore-t1,liftoff,night}.jpg`, `038-after-lake-near.jpg`, `038-after-lake-half-rung.jpg`, `038-precompile-badge.jpg`.
- [x] **Motion measured**: two frames of the river 1 s apart differ along the river and not on the ground (mean absolute difference in the river mask at least 3 times the difference outside it); two frames of a shore 0.75 s apart differ in the surf band. Result (journal 038): river pixels 13.29 against 1.86 for the ground (7.1 times; base 0.60 against 0.77), 0.8 s apart; surf foam 2.96 against 0.02 for the sand, 1.8 s apart (the plan said 1 s and 0.75 s; the measured intervals are the ones the harness could hold).
- [x] **Frame budget held** (journal 054's method and table as the baseline: production build of a clean copy, 1920 x 1080 at ratio 1, governor off, minimum of 12 windows, second page load): `high` at most 16.7 ms and `medium` at most 13.3 ms sync at the pad, 3 km, 12 km, orbit, hillside (two views) and on two new scenes (a lake and river at 2 km, a shore at 1 km), with the delta against the baseline reported per scene, and the half rung (`setPlanetScale(0.5)`) renders those two scenes. Result: `high` worst 15.57 ms (pad), `medium` worst 12.88 ms (hillside), nine scenes each, deltas +0.2 to +1.0 ms thr; the half rung renders the lake, shore and river scenes (10.1 to 11.5 ms).
- [x] **Precompile**: total time of `precompile()` and the first `setPreset` hitch measured on the baseline build and on this plan under the same protocol; the total does not regress and the hitch after the precompile has finished does not worsen; progress reaches `done == total`; the indicator shows during it, as a web unit test of its model and a screenshot of the flight page. Result: base 79.9 and 83.9 s against 10.1 to 30.6 s (this plan), programs ready 1.4 s after the first frame, first-switch hitch not worse (28 to 50 ms against 31 to 63), badge text 27 percent, 63 percent, gone, and the screenshot.
- [x] Devices, mobile, floating, analytic derivatives and anti-aliasing are not claimed; drafts 066 to 068 exist with reasons; the roadmap lists a follow-up draft, not 038. Drafts 066, 067, 068 exist; the roadmap lists 066 and 067 instead of 038.
- [x] `bun test packages/renderer`, `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check` pass; prettier clean on my files (other sessions' failures reported separately). Result: renderer 522 pass; `bun run test` 1206 pass and 1 fail (`mods/stock` boot test: plan 040's unfinished `stock.engine-cluster`, not this plan); web vitest 654 pass; typecheck 0 errors; build done; docs:check OK; prettier clean on my files.

## Docs checklist

- [x] STATUS, journal 038, ADRs 0072 to 0074 (and the index), `docs/research/three.md` (plan 038), roadmap page (and its test), drafts 066 to 068 with board rows, `docs/architecture` (overview, plugin-system).

## Log

- 2026-10-17 — Created as draft by the physical-terrain session (pushed out of plan 031).
- 2026-10-17 — Refined draft → ready at the human's request (session: water session). Decisions: lakes are carved into the core biome map (solid like the sea; floating is draft 067), flow by a two-phase flow map, shore waves by shoaling phase, the site animated from the snapshot, precompile measured and given progress. Devices stay a draft (no hardware); analytic derivatives and silhouette anti-aliasing pushed to draft 068 (not cheap; reasons in ADR 0072).
- 2026-10-17 — Started (water session). Baseline `base` build of HEAD 94b61f3 measured first (`high` pad 14.06 ms sync, precompile 79.9 s, 83.9 s).
- 2026-10-17 — Deviation, lakes: the first design (carve the biome map's elevation, ADR 0072 as first written) put coast cliffs of slope 2.06 on the terrain, because the coast margin of `terrainHeight` is a smoothstep of the map elevation; replaced by a lake in the height function (a level from one octave of noise times a site gate; flat floor at 0; a Lipschitz cone cap around it). The ADR was rewritten before the code landed. The gradient bound is measured, not derived.
- 2026-10-17 — Deviation, precompile: the plan assumed the shader compile was the slow part; measured, the programs are ready 1.4 s after the first frame and the 80 s was the vegetation warm-up waiting on idle periods; the order of jobs (reachable presets first) is kept but is not what changed the time.
- 2026-10-17 — Executed (water session). All criteria met with the notes above; M1/M2/Intel/phones not available (draft 066), floating (067), analytic gradients and silhouette anti-aliasing (068). API 0.1.21. ADRs 0072 to 0074. Found, not done: close-range blockiness and stair-step coast (base too), flat-coast terraces at low sun (base too), terrain slope above 1 at rare points (journal 038).

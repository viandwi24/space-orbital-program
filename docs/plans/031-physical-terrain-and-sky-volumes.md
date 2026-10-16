---
id: 031
title: "Physical terrain heights, volumetric sky and site animation"
status: in-progress
owner: "physical-terrain session (Claude, 2026-10-17)"
depends: [027]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 031 — Physical terrain heights, volumetric sky and site animation

## Goal

What plan 027's self-review still names, in the order that matters for a game about landing: **a vessel that lands in the hills stands on the hills**. The sim's ground, the surface rails, the debris rules and the drawn terrain read one height function (ADR 0043), the camera bubble that melted relief near a low camera is deleted, and the planet pass draws the ground under and around the camera from that function with centimetre agreement (ADR 0044). On top of that, the look problems 027 listed that a player sees first (pale low mountains from the pad, coast stair-steps, flat paper clouds, the blurry lowland, the static silhouette) are fixed where a day of shader work fixes them, and the rest is moved to a draft with its reason.

## Context

- Read: `docs/journal/027-terrain-and-sky-follow-ups.md` (self-review, "Not done"), ADR 0036 (visual terrain, the bubble: points 1 and 3 are superseded by ADR 0043), ADR 0037 (layers, haze, waves), ADR 0019 (ground tile; superseded in part by ADR 0043), ADR 0024 (surface rails), ADR 0025 and `docs/product/visual-direction.md`, ADR 0030, `docs/architecture/simulation.md`, `docs/architecture/boundaries.md`, journals 012, 016, 019, 025, 027.
- The human (2026-10-16): "Don't stop until all plans and work are done and ready to market to the public. Don't stop if it's not right or not good enough for the public." Mountains that are only paint, a lander that sinks into them and relief that melts as you approach are a release blocker for a game about landing.
- Concurrent sessions: plan 029 (VAB, `packages/renderer/src/vab/**`) and plan 032 (scripting, e2e tooling). This plan touches `packages/core` (additive), `packages/sim`, `packages/renderer` environment and shaders, and `apps/web/src/lib/sim.worker.ts` (one option).
- Research (2026-10-17): `docs/research/terrain-physical.md`.

## Scope

**In, ordered.**

1. **Physical heights (ADR 0043).** The height function moves from the renderer to `@orbital/core` (`terrain.ts`, with the biome map and noise it reads), made smooth where the old one had creases (the ridge `abs` is a soft abs) and given a fractal coast. `createSim({ terrain })` takes a `TerrainField` (additive; absent = the old flat sphere). The ground tile follows the terrain (the tangent plane of the terrain under the centre of mass, with its slope), the tile band and the debris and ballistic rules measure altitude above the terrain, `placeOnSurface` stands on the terrain, the snapshot reports `terrainHeight`, and surface rails carry over unchanged. API 0.1.8 to 0.1.9.
2. **Visual surface that agrees with it (ADR 0044).** The cube bake keeps the far field (height now split in two half-float channels so it is exact to millimetres); two camera-centred gnomonic patches (4 m texels over 4 km and 32 m texels over 32 km at `high`) are baked from the same function and win near the camera; the camera is held above the terrain; the bubble is deleted.
3. **The most visible look problems** (each is done with before/after screenshots or moved to the draft with its reason): pale low mountains from the pad, coast stair-steps, flat cumulus, the blurry lowland at 0.7 to 3 km, silhouette aliasing, the shader-compile hitch question.
4. **Frame times** per preset with the new passes.

**Out (moved to drafts, reasons in ADR 0044 and the journal):** ray-marched volumetric clouds with light shafts (an entire second rendering pass with its own budget and temporal reprojection), lakes, river flow and breaking shore waves, launch-site animation, M1/M2 and Intel measurements (no such hardware here), mobile, analytic noise derivatives, a mesh/clipmap geometry path. Collisions of a vessel with terrain on rails (rails have none).

## Design notes

- One function: `terrainHeight(n, ctx)` in `core`, `n` a body-fixed unit direction, `ctx = { radius, map, siteDirection }`. `createTerrainField({ radius, latitude, longitude })` builds the canonical biome map (1024 x 512, 0.3 s once) lazily and returns `{ heightAt(n), maxHeight }`. The sim passes inertial positions through `Ry(-omega t)` before asking.
- Ground tile: the plane through the terrain point under the centre of mass with the normal from a central difference of 4 m; the box and the impact rule (closing speed along the plane normal) are ADR 0019's. Slope behaviour is Rapier's rigid body with friction 0.8: a vessel slides on slopes steeper than `atan(0.8)` = 38.7 degrees and tips when the centre of mass leaves the support polygon of its feet; the stated rule is that, nothing else.
- Parity: TypeScript float64 is the reference; the GLSL twin takes every constant from the TypeScript table. A patch texel is within a few millimetres in float32; between texels the error is bilinear interpolation of a smooth field, measured in `terrain.test.ts` on the exact grids the patches use.
- Renderer imports `core` and `three` only (no boundary change): the table in `boundaries.md` already allows `core` for both sim and renderer.

## Steps

1. Refine, ADRs 0043 and 0044, research file (this refinement).
2. Core: move `noise`, `planet-map`, `terrain` (height function, field, constants) to `@orbital/core` with tests; renderer imports them; soft ridge and coast detail; delete the bubble. API version.
3. Sim: `terrain` option, `SimCore.terrain`, tile on terrain, altitude rules, placement, snapshot field; tests with synthetic ramps; docs.
4. Renderer: hi/lo bake, patches, `terrainAt` in the planet pass, camera clamp, presets, tests; the web worker passes the field.
5. Browser: parity readback, landing screenshots, view screenshots, frame times.
6. Look items; drafts for what does not fit.
7. Docs, journal, self-review, commits.

## Acceptance criteria

**Physical heights**

- [ ] `packages/core/test/terrain.test.ts`: deterministic (repeated calls, rebuilt map), continuous (|dh| <= 0.95 x distance over 3000 pairs 200 m apart), bounded (0 <= h <= `TERRAIN_MAX_HEIGHT`), zero over ocean and exactly zero within 5 km of the site, monotone through the blend ring, at least 800 m somewhere within 70 km of the site, skyline from the pad eye at least 1.0 degree (moved from the renderer; raised by the look item below), ridge crease softened (second difference of the ridge field across a crease is bounded by a stated curvature).
- [ ] `terrain.test.ts`: `createTerrainField(...).heightAt` equals `terrainHeight` with the canonical map for 500 directions, and the field is lazy (no map built before the first query).
- [ ] `terrain.test.ts`: the patch grids reproduce the height function: bilinear interpolation of samples on the 4 m grid is within 0.15 m and on the 32 m grid within 2.0 m of `terrainHeight` over a fixed set of 20 000 points in the massif (maximum, not mean).
- [ ] `packages/sim/test/terrain.test.ts`: a probe dropped with its feet 0.5 m above a 15 degree ramp (synthetic `TerrainField`) comes to rest with the lowest foot within 0.15 m of the ramp surface and speed under 0.05 m/s after 10 s; on a 30 degree ramp it rests; on a 45 degree ramp it slides (speed above 0.5 m/s after 5 s); a tall narrow stack on a 20 degree ramp tips over (its axis turns by more than 40 degrees) while a wide-legged lander on the same ramp does not.
- [ ] `terrain.test.ts` (sim): the tile exists when the vessel is 1 m above terrain at 3 000 m above the reference sphere and the vessel rests there (`landed`), and there is no tile 1 000 m above the same terrain.
- [ ] `terrain.test.ts` (sim): impact rule on a slope: 5 m/s vertical landing on a 30 degree ramp breaks nothing (normal closing speed 4.3 < tolerance), 7.5 m/s vertical landing breaks a leg (6.5 > tolerance); the outcome is reported by `part:damaged`.
- [ ] `terrain.test.ts` (sim): a controlled vessel at rest on a ramp goes on surface rails after 2 s, its body-fixed position holds over a 1e5 s warp, and on wake it neither moves more than 0.05 m nor takes damage in the next 5 s.
- [ ] `terrain.test.ts` (sim): `load-vessel` at a latitude/longitude on a mountain stands on the terrain (lowest point within 0.3 m of the terrain surface plus the stated slope margin), and in the flat zone around the launch site the vessel stands exactly where it stood before (the pad is unchanged: pad drift tests).
- [ ] `terrain.test.ts` (sim): debris on a descending Kepler path is destroyed at the terrain height, not at the sphere (a path that passes 500 m above the sphere over a 1 000 m peak is destroyed; over the sea it is not).
- [ ] Determinism: two sims with the same terrain and script give equal JSON snapshots and worlds (`determinism.test.ts` extended); every existing sim test (landing, ground, surface rails, debris, heating, scenario-orbit, radial, fins) passes unchanged with no terrain option.
- [ ] `snapshot`: `VesselSnapshot.terrainHeight` equals `terrainHeight` of the vessel's body-fixed direction when the sim has terrain and is absent without.

**Renderer**

- [ ] `grep -rniE "bubble" packages/renderer/src packages/core/src packages/sim/src` finds nothing; `terrain-model.test.ts` no longer tests a bubble.
- [ ] `terrain-model.test.ts` / `terrain-patch.test.ts`: the renderer imports `TERRAIN_*`, the shape table and the octave rotation from `@orbital/core` (the GLSL constants generated from them; a test compares the generated text with the core values), the patch geometry (centre, axes, span, texel size) is pure and tested: the projection of a direction to patch coordinates and back is the identity within 1e-9, the re-centring rule never leaves the camera outside the inner 35 %, and the preset table is monotone (low <= medium <= high).
- [ ] `terrain-patch.test.ts`: the camera clamp keeps the camera at least 1 m above the terrain at 1 000 random positions inside mountains and never moves a camera that is already above.
- [ ] [manual] In the built-in browser: the bake read back from the GPU agrees with `terrainHeight` evaluated in the page: maximum error over 400 random directions within the patches under 0.1 m, over the cube under 100 m (the cube is the far field); printed in the journal.

**Look and performance**

- [ ] [manual] Landing sequence on a hill (approach, touchdown, resting with the horizon; the vessel's feet visibly on the ground, the ground not sinking into the hull): `docs/journal/assets/031-landing-*.png`, with the numeric gap between the vessel's lowest point and the drawn surface from the page.
- [ ] [manual] Before/after of the views plan 027 named (pad, 3 km, coast at low sun, cumulus from the pad) in `docs/journal/assets/031-*.png`.
- [ ] [manual] Frame times per preset (low, medium, high), thr and sync as in journals 019/025/027: `high` at the pad does not exceed plan 027's 15.9 ms sync on the same machine (state the number honestly otherwise) and the new passes' costs are listed.
- [ ] [manual] Written self-review against `visual-direction.md` in the journal.
- [ ] `bun test packages/sim packages/physics packages/renderer packages/core`, `bun test`, apps/web tests, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on touched files.

## Docs checklist

- [ ] STATUS (row 031, journal link, known issues), journal `031-physical-terrain-and-sky-volumes.md`, ADRs 0043 and 0044 (0019, 0024 and 0036 status lines updated), `docs/architecture/simulation.md`, `docs/architecture/boundaries.md` only if a rule changes (it does not), `docs/research/terrain-physical.md`, `docs/research/three.md`, new draft plans with board rows.

## Log

- 2026-10-17 — Created as draft by the terrain session (pushed out of plan 027).
- 2026-10-17 — Refined draft → ready at the human's request (session: physical-terrain session). Item order changed from the draft: physical heights and the matching visual surface first; volumetric clouds, water, site animation, devices and mobile pushed to drafts with reasons.

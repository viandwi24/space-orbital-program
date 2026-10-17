---
id: 067
title: "Floating, sinking and boats: buoyancy on the sea and on lakes"
status: in-progress
owner: "Agent 3"
depends: [038, 095, 103]
phase: 3
created: 2026-10-17
updated: 2026-10-18
---

# 067 — Floating, sinking and boats

## Goal

A vessel that comes down on water (the sea, a lake) floats, tips or sinks according to its mass and the volume of its parts, instead of resting on the water's surface as on land. Plan 038 made lakes as solid as the sea (the height function is exactly zero on a lake floor); this plan replaces that solid surface by a water level the sim can displace.

## Context

- Pushed out of plan 038 (ADR 0072): the sim has no water at all (journal 031: "ocean is solid"; ADR 0019 puts a kinematic ground tile on the terrain height), so lakes needed no sim change, and a lake that sank vessels while the sea did not would have been inconsistent.
- Needed: where the water is (`isLake` in `packages/core/src/terrain.ts` and the biome map's sea level are the data; an `isWater(direction)` in core), a buoyancy force per part from its displaced volume (a part's `shape` gives the volume), drag in water, a "splashed down" event, and a landing-gear interaction with floating (`stock.landing-legs`).
- Read: ADR 0019, ADR 0043, ADR 0072, `docs/architecture/units-and-frames.md`, journal 012 and 031.
- Foundation (ADR 0098, 0097): recovery is paid by a visible formula that distinguishes sea and land (plan 095), and coastal sites and range safety (plans 092, 127) assume stages fall into the sea. A floating capsule makes sea recovery physical; until this plan lands, recovery treats a splashdown as a landing on water at rest.

## Scope

**In:**
- Core: `waterAt(direction)` on a terrain field (sea where the warped map elevation is below `SEA_LEVEL`, and lakes); the hills field implements it, other fields have no water. Range safety (127) reads the same function.
- Sim: over water the ground tile drops to a seabed `WATER_DEPTH` (30 m) below the water plane; buoyancy and water drag per part from slices of its shape volume (cylinder or box), applied at the slices, so a vessel rights itself or tips by its shape; a wet vessel counts as landed, so it can rest, go to surface rails and be recovered.
- Water impacts: a part that enters the water is damaged by the ground rule with its entry speed × `WATER_IMPACT_FACTOR` (0.5).
- Science (103): `splashed` is a landed vessel on water (`waterAt`), replacing "terrain below sea level".
- Stock: a flotation collar (large volume, low mass) so a capsule floats upright with margin.

**Out:** waves that move the vessel, boats with propellers, swimming crew; ripples and the splash effect (draft 193).

## Touches

- **Size:** M
- **Edits:** `packages/core/src/terrain.ts`, `packages/sim`, `mods/stock`
- **Shared contracts:** core (`TerrainField.waterAt`, water constants); no new part fields (the volume comes from `shape`)

## Steps

1. ADR 0182; `waterAt` in core with tests.
2. Seabed tile, buoyancy and water drag, wet counts as landed.
3. Water impacts, splashed situation, flotation collar.
4. Tests, docs.

## Acceptance criteria

- [ ] `bun test packages/sim/test/buoyancy.test.ts`: a command pod dropped on the sea comes to rest floating with its submerged volume within 10 % of its mass over the water density; a 17.6 t two-stage rocket (the test helper's heaviest, denser than water) sinks to the seabed; deterministic end states.
- [ ] Same file: the same on a lake (`isLake`).
- [ ] Same file: an entry at 15 m/s leaves a pod whole on water and breaks it on ground; at 50 m/s on water it is damaged.
- [ ] Same file: a pod floating at rest is `stock.splashed` and can be recovered.
- [ ] `bun test packages/core/test/terrain.test.ts` (or a new water test): `waterAt` is true where the map is below sea level or `isLake`, false elsewhere.
- [ ] `bun test`, typecheck, build, docs:check pass; the headless ascent still reaches orbit.

## Docs checklist

- [ ] STATUS, journal (`docs/journal/067-buoyancy-floating-and-sinking.md`), ADR 0182 (the force model), `docs/architecture/simulation.md` physics section.

## Log

- 2026-10-17 — Created as draft by plan 038 (ADR 0072: lakes are solid like the sea for now).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0098, 0097: sea recovery and impact classification use it).
- 2026-10-17 — `depends` gains 095, 103 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the realignment puts the recovery hook (095) and the "splashed" science situation (103) in scope.
- 2026-10-18 — Refined and claimed by Agent 3. Volumes come from part shapes, so there are no new part fields. Ripples and the splash effect move to draft 193 (WebGL cannot be checked on this machine). Design choices go in ADR 0182.

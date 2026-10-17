---
id: 060
title: "Stones you can hit: collision for scenery stones"
status: done
owner: "stones session (Claude, 2026-10-17)"
depends: [052]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 060 — Stones you can hit

## Goal

A lander's leg that comes down on a boulder rests on it (or the lander tips), instead of sinking into scenery.

## Context

- Found, not done, in plan 052 (ADR 0068 point 9): the stones are a pure function of a world-fixed lattice (`stones-model.ts`, renderer only) and have no collision; the sim's ground is the height field of `createBodyTerrainField` (a kinematic ground tile, ADR 0019, 0043). A boulder is up to 1.5 m across, a lander leg lands within a metre of its spot, so the case is real but rare.

## Scope

**In:** the lattice, its hashes and a collision shape for a stone move into `@orbital/core` (`stones.ts`: `STONES`, `stonesAround`, `stoneCollider`, `stoneSalt`, `bodyHasStones`; the body's craters seed shifts the lattice salt, seed 0 is the old pattern); the renderer draws from it (its own `stones-model.ts` is deleted); the sim gives a flight vessel near the ground of a craters body one kinematic body of stone spheres next to its ground tile, with the same contact rules for `landed` and impact damage ([ADR 0092](../decisions/0092-stones-are-colliders-from-one-core-lattice.md)).
**Out:** destructible or movable stones, stones on the home planet or on a `hills` body, stones as part of the vessel placement (a vessel loaded on the surface starts above the ground plane and may start inside a stone: the solver pushes it out), tunnelling of a fast vessel through a small stone (no CCD: only touchdown speeds are in scope).

## Design notes

- Stone = sphere whose cap above the ground is the drawn dome (`flatten`, `sink` of `STONES`): radius `(r^2 + c^2) / 2c`, `c = 0.624 r`.
- Window 24 m round the vessel's centre of mass, at most 96 nearest stones, rebuilt after 8 m of travel, built below 60 m of altitude over the terrain and dropped above 80 m; fixed to the rotating ground like the tile.
- Contact normal for damage: from the stone's centre through the contact point (a stone's side is not the tile's plane).

## Steps

1. Refine (ADR, criteria).
2. Core: move the lattice, add `seed`, `stoneCollider`, `bodyHasStones`; export; move its tests.
3. Renderer: import from core, seed in `MoonStones`, `uStoneSalt` in the shader.
4. Sim: `stones.ts`, constants, `GroundTile.stones`, `updateStones`, contacts.
5. Tests, measurements, screenshot, docs.

## Acceptance criteria

- [x] Core: renderer and sim get identical stone sets (both call `stonesAround`; `bun test packages/core/test/stones.test.ts`, `packages/renderer/test/stones.test.ts` "drawn stones are core stones"), deterministic (same list byte for byte, any viewpoint), budget (at most 1 024 within 56 m, at most 96 colliders; the busiest ground fits the cap), seed 0 equals the old lattice and another seed differs.
- [x] Sim, `packages/sim/test/stones.test.ts`: a lander foot coming down on a stone of cap 0.30 m rests on it (tilt 1 degree to 1.1 x the three-point bound, raised between 0.03 m and the cap, at rest, nothing damaged); a boulder with a cap above 0.45 m tips the lander (tilt over 45 degrees; the rule is measured, ADR 0092); a landing 2.5 m from a stone's side is the flat landing (height within 0.1 m, tilt under 2 degrees, no damage); an engine landing on a stone at 5 m/s breaks as on bare ground, at 1 m/s nothing; two runs byte-identical; resume after a save in flight lands within the bound a bare ground has; the home planet gets no stone body; the stone body is built once and kept while resting.
- [x] Moon landing, resume, surface rails and terrain-kind tests of the sim stay green (`bun run test`: 1284 pass, 0 fail).
- [x] Step cost: stones add under 0.1 ms to the mean step (0.004 ms measured) and no step takes 15 ms (0.18 ms worst); a field build under 5 ms (0.04 ms worst).
- [x] Screenshot `docs/journal/assets/060-lander-resting-on-boulder.jpg` (a lander of the sim, built in the page, resting with one foot on a 1.35 m boulder).
- [x] Repo checks: `bun run test`, `bun test packages/renderer`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on the plan's files (see the journal for the output and other sessions' failures).

## Docs checklist

- [x] STATUS, journal 060, ADR 0092, `simulation.md`, research `stones-collision.md`, roadmap entry removed.

## Log

- 2026-10-17 — Created as draft by plan 052 (found, not done).
- 2026-10-17 — Refined draft -> ready at the human's request (session: stones session). Decisions in ADR 0092; criteria made measurable (above).
- 2026-10-17 — Started (in-progress). The tipping rule I first derived (centre of mass leaves the support triangle at a cap of 0.69 m) was wrong: a 0.56 m cap also tipped. A scan over 12 sites gave the empirical threshold (rest up to 0.42, tip from 0.49); the test states it as measured.
- 2026-10-17 — Done. API_VERSION unchanged (0.1.23): the mod contract is untouched; `@orbital/core` gained exports only.

# 0077 — Wreckage and stages that came to rest are kept by the renderer, not the sim

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/040-effects-and-assets-3.md

## Context

Plan 033's debris pieces (ADR 0047) fly for three seconds and vanish with the explosion, and the sim removes an uncontrolled vessel that has lain still for 10 s (ADR 0021, rule 3), so a crashed rocket leaves nothing and a stage that landed softly pops out of existence. Draft 040 assumed that keeping them meant changing ADR 0021. That rule exists so debris cannot block time warp ("every vessel on rails") or load the contact solver; a thing the player only looks at needs neither.

## Decision

The sim and ADR 0021 are unchanged. The renderer keeps what it can infer from consecutive snapshots (ADR 0028, point 4), in two forms, both cosmetic and both gone after 900 s of simulated time (`WRECK_LIFETIME`, `REMNANT_LIFETIME`; no time passes while the sim is paused, a jump backwards in time clears them):

1. **Wreckage.** An impact event (a vanished part with ground speed over 4 m/s and not hot) within 300 m of the ground plans where every thrown piece lands: the landing time solves `y(t) = floor` for the ballistic path of ADR 0047, the rest point is that path's `(x, z)`, the rest height follows the terrain under the piece (the ground height of `EffectsOptions.groundHeight`, curvature included), and the rest pose lies the prism flat on its larger face with a seeded yaw. Pieces that would fly more than 12 s are not kept. The flight draws the pieces as before, each settling from its tumble into the rest pose over 0.25 s after it lands (and charring to 0.55 of its paint colour); when the last has settled, one static mesh per wreck (one draw call) takes over, placed from the body's orientation each frame so it turns with the ground. At most 8 wrecks (the oldest goes), none on `low` (it throws no pieces, `debrisShards` 0). A fresh wreck smoulders (dark puffs, fewer as it cools) for 45 s. In the last 30 s it sinks 1.5 m into the ground. The tangent frame of the explosion is now fixed to the body (it was re-derived from the body's turn every frame), so pieces stay where they landed.
2. **Remnants.** The renderer tracks how long each vessel has lain still on the ground (ground speed under 0.3 m/s, root within 30 m of the ground, no part over 700 K, at most 24 parts). A vessel that disappears after 9 s of rest, in a normal step (0 to 5 s), that was not the active vessel, is what the sim's rule 3 removed: its part models are kept, put in their last state with no flame or glow, and turn with the body. At most 3 remnants; a preset switch drops them (their models belong to the factory that is replaced).

## Alternatives considered

- **Change ADR 0021 (keep debris in the sim, cap the count).** Real objects that block warp, load physics and need a save format; the invariant that made time warp simple would go for a picture.
- **A sim event "debris at rest".** Would let the renderer know why a vessel vanished, but the renderer already infers it well enough, and a new event is protocol (and a reason to bump the sim) for a cosmetic.
- **Per-frame rewriting of every wreck into the shared shard mesh.** Cheap at one wreck, 8 wrecks of 48 pieces would rewrite 27 000 floats a frame for nothing; static meshes are written once.

## Consequences

- A stage left standing is a picture, not an object: the player cannot hit it, it casts no shadow on terrain and a preset switch removes it. If wreckage ever needs to block (stones with collision, draft 060), that is a sim feature.
- Remnants are a guess: a vessel the player recovered or replaced in a way the sim reports as a vanish after rest would also stay; the active-vessel and normal-step checks cover the flows the game has today (launch, staging, crash, load).
- Wrecks of an impact on a body without ground height data lie on the reference sphere.

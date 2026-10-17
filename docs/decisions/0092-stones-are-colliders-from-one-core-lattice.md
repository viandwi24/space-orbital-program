# 0092 — Stones are colliders: one lattice in core, spheres in a second kinematic body

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/060-stones-with-collision.md
**Builds on:** ADR 0019 (ground tile, contact readback, impact damage), 0043 (one height function), 0067 (terrain kind and seed), 0068 (stones as a lattice; its point 9 is superseded here).
**Research:** [stones-collision.md](../research/stones-collision.md)

## Context

A stone of the moon (ADR 0068) is a boulder up to 1.5 m across and a lander leg lands within a metre of its spot, but the sim's ground was the tile (a plane through the terrain) and the stones had no collision: a foot sank into a stone the picture showed. The lattice lived in the renderer, which the sim may not import.

## Decision

1. **The lattice moves to `@orbital/core`** (`stones.ts`, from `packages/renderer/src/stones-model.ts`): `STONES`, `chartOf`, `chartDirection`, `stoneInCell`, `stonesAround`, plus `stoneCollider` and `bodyHasStones`. It was pure integer hashing already (`pcgX`), so the move changes no value. The renderer's file is deleted; the renderer's meshes, its GLSL twin and the sim all read the one definition.
2. **A seed.** The lattice salt is `STONES.salt + 1009 * seed` (`stoneSalt`), the seed being the body's craters seed (`terrain.seed`, default 0): two bodies of a mod do not share a pattern. Seed 0 is the pattern every body had, so the stock moon's stones did not move. The shader takes the salt as a uniform (`uStoneSalt`).
3. **A stone is a sphere** whose cap above the ground has the drawn dome's height `flatten * (1 - sink) * r = 0.624 r` and base radius `r`: radius `(r^2 + c^2) / 2c` (1.116 r for the drawn proportions), centre `c - radius` above the ground (0.5 r below it). A foot meets the surface the eye sees; the mesh's per-vertex jitter (+-20 percent) is not followed.
4. **Where they live in the sim.** A flight vessel on a body with `bodyHasStones` and a terrain field (craters; not the home planet, not `hills`) whose centre of mass is within 60 m of the terrain (dropped above 80 m) has, next to its ground tile (ADR 0019), one kinematic body (`GroundTile.stones`) with one sphere per stone: the 96 nearest within 24 m of the centre of mass when the field was built, each standing on the terrain height under it (`terrain.heightAt`). The body is fixed to the rotating ground (body-fixed axes anchored on the terrain point under the centre of mass when built; position and velocity each step like the tile) and is rebuilt when the centre of mass has moved 8 m from the anchor, so the window still reaches 16 m round the vessel. The busiest ground (54 percent of cells) holds 75 stones within 16 m, under the cap of 96. Friction 0.8 (the ground's), restitution 0.
5. **Damage and landing.** Contacts with the stone body are read like the tile's (`distance <= 0.02 m`): `landed` is set, and a part's impact speed is the closing speed against the ground at the point along the stone's normal (from the sphere's centre through the contact point; a point on no stone, within 5 cm of a surface, uses the tile normal). Tolerances, `broken` and `destroyed` are ADR 0019's.
6. **Derived, not saved.** Nothing of a stone is in `SimSave`: a resumed vessel, one woken from surface rails or one loaded builds the field from the same function at its next step. Resume stays within the bound of ADR 0050 for ground contact (cm-level on this ground with or without a stone: 1.6 and 2.5 cm in the test, in a landing that settles for 30 s).
7. **API.** The mod contract does not change (no `define*`, `PluginContext`, protocol or snapshot change), so `API_VERSION` stays 0.1.23; `@orbital/core` gains exports.

## What happens on a stone (measured, `test/stones.test.ts`)

A rigid body on a plane and a few spheres with friction 0.8 has no tipping rule of its own: the stock lander (COM 5.8 m up, feet 2 m from the axis) with one foot on a stone rests on three feet, tilted by at most `atan(sqrt(2) h / 4)` for a cap `h` (measured 4.2 degrees at h = 0.30, bound 6.1), and lies on its side when the lean goes the other way. A scan of 12 sites (foot over the apex, 0.5 m/s) gave: caps up to 0.42 m rest (3.5 to 5.9 degrees), caps from 0.495 m up tip (all 8 sites). My first derivation (the centre of mass leaving the support triangle at 0.69 m) was wrong and is not claimed; the threshold is the measurement. A taller or wider lander moves it, which is physics, not a rule to keep.

## Alternatives considered

- **Stones in the ground tile's compound.** The tile follows the centre of mass every step; stones fixed to the ground need their own anchor, and a rebuilt tile body each time the stone set changes would reset its contacts.
- **A height field with the stones added** (a tile whose top face has bumps): Rapier heightfields are planar and static (ADR 0043's alternatives); the spheres cost a handful of colliders.
- **Boxes or convex hulls of the rendered rocks:** the rock mesh is the renderer's (jittered icosphere, instanced on the GPU); a sphere is what the drawn proportions give, and a flat-bottomed foot on a dome is the interesting case.
- **No seed (the lattice stays world-fixed for every body):** two cratered moons would show the same boulders. Cost: one uniform.
- **Colliders for the whole window of the instanced radius (56 m):** hundreds of bodies for a vessel that touches within 3 m; 24 m with a rebuild cadence is enough for a vessel that moves at landing speeds.

## Consequences

- Cost (journal 060): the mean step of a lander coming down and resting on busy ground rises by 0.004 ms (0.024 against 0.020), the worst step is 0.18 ms; building a field is 0.04 ms.
- A fast vessel can pass through a small stone (no continuous collision detection against a kinematic body, Rapier docs): only touchdown speeds are in scope; it would also have hit the tile.
- A vessel loaded on the surface is placed above the tile's plane, so it may start inside a stone and be pushed out. Not changed (placement is outside this plan).
- The stone's height is the terrain function's, the tile's is a plane fitted at the centre of mass: on a slope they differ by `d^2 / 2 R_curv` over the distance `d` from the centre of mass (centimetres to 0.25 m at 10 m on crater walls); stones on slopes are best-effort.
- The renderer's stones are 0.8 to 1.2 of the radius by mesh jitter; the collider is the mean.

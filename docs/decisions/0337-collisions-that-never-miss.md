# 0337 — Collisions that never miss: a load range, merged physics frames, a ground plane that clears the footprint

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/391-collisions-that-never-miss.md
**Builds on:** ADR 0018 (one compound body per vessel), ADR 0019 (the ground tile), ADR 0043 (terrain), ADR 0334 (pair contacts)
**Amends:** ADR 0019 (the tile's plane rises to clear the vessel's footprint)

## Context

`refs/graphics-v2/04-physics-fling-and-collision.md` Part 2: a controlled vessel flew through idle vessels and debris on rails (they have no body), two vessels in different physics frames could never meet, one flat plane under the centre of mass put the far parts of a long vehicle into the terrain, every ground tile pushed every vessel, a docking merge averaged spins by mass, and nothing asked for continuous collision.

## Decision

1. **A load range** (`LOAD_RANGE` 2 000 m, `LOAD_LOOKAHEAD` 5 s; `wakeLoadRange` in `modes.ts`, before the step's forces). A vessel on orbital rails closer than `LOAD_RANGE + |v_rel|·5 s` to a controlled flight vessel of the same sphere of influence is woken (if a frame is free); `railsEligible` and `ballisticEligible` refuse while a vessel is inside that range of a controlled flight vessel. Surface and frozen rails keep their place.
2. **Frames merge** (`mergeFrames` in `frames.ts`, after the wakes): when any two vessels of two frames of one body are within `LOAD_RANGE`, every vessel of the later frame moves into the earlier one, its body rebuilt at the same inertial pose and velocity (local′ = local + oB − oA, v′ = v + vB − vA), if all of them stay within `FRAME_MERGE_REACH` (5 km) of the target frame's origin so the f32 world keeps its precision. Tiles, wet sets and grace pairs of a moved vessel are dropped and rebuilt.
3. **Each ground tile touches only its own vessel** (`isolateTiles`): the pairs tile ↔ other vessel (and stones ↔ other vessel) are ignored in the backend (ADR 0334's `setPairContacts`), every step.
4. **The ground plane clears the whole footprint on bodies with terrain** (amends ADR 0019, C4). The tile stays the thick tangent plane under the centre of mass; it now rises to the highest terrain under the vessel's supports (`supportRaise`): the lowest corners of its colliders (within 3 m of the plane, 8 at most) are asked for the terrain under them, and the plane rises to the highest of them, by no more than that corner's height plus 0.5 m (a cliff face is not a floor). A rover with its front wheels over a bump no longer sinks them into it; its rear wheels may stand above the ground by the height of the bump, which a height field would not do.
5. **A rebuilt body is lifted out of the ground** (`liftOutOfGround`, in `refreshColliders`): a leg deployed on the ground puts its feet below it and the solver shoved the ship up at 0.7 m/s; the deepest corner's depth, along the local vertical, is added to the body's origin at the rebuild, and the kick is gone (under 0.5 m/s).
6. **No CCD.** `setCcdEnabled` on the dynamic bodies made a plane at 70 m/s stick to the ground, and Rapier's contact prediction stops a 0.1 m slab at 400 m/s against a fixed one without it; the unit test guards that.
7. **Docking conserves angular momentum** (`jointSpin`): the joint body's spin is I⁻¹L about the joint centre of mass, L the sum of each body's I·ω and m·(c − c_joint) × (v − v_joint), not the mass-weighted mean of the spins.
8. **A wheel's contact point is the mean of its contact points**, not a pairwise halving that leans to the last one.

## Alternatives considered

- **A height-field patch for the ground** (built, working for a rover and the terrain suite, then dropped): a height field is a surface without thickness. A plane landing at 5 m/s ended 0.4 m inside the ground, on the slab under it; a leg or wheel that appears below it stays below it; Rapier gives its manifolds no solver contacts, so the contact points had to be rebuilt from the narrow phase and the tyre model's side grip, which depended on where those points sat, went unstable above 75 m/s. Heights 170 m from the body origin made a resting pod rock until the body was put at the surface's height. A thick plane has none of these.
- **One thick plane per support** (one body each): the right answer for a rover's rear wheels; more bodies, seams between planes and a contact list per vessel. Left for when a vehicle needs it.
- **A 1 m patch cell**: four times the samples (the real terrain costs about 35 µs a sample).

## Consequences

- Up to 8 terrain samples a step for a vessel within 3 m of the ground (about 0.3 ms with the procedural terrain), none above.
- A vehicle on uneven ground rests on its highest support: the rest of it may stand above the ground by the bump's height.
- A frame merge moves a vessel's body between worlds; its tile is rebuilt in the new one.

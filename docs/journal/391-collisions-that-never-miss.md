# 391 — Collisions that never miss

**Plan:** [plans/391-collisions-that-never-miss.md](../plans/391-collisions-that-never-miss.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0337 (0018, 0019, 0043, 0334) · **Note:** [refs/graphics-v2/04-physics-fling-and-collision.md](../../refs/graphics-v2/04-physics-fling-and-collision.md)

## What was done

| Where | What |
|---|---|
| `sim/modes.ts`, `constants.ts`, `sim.ts` | `LOAD_RANGE`, `wakeLoadRange`, rails refused in range |
| `sim/frames.ts` | `mergeFrames`, `isolateTiles`, `supportRaise` (the ground plane clears the footprint), `liftOutOfGround` on a rebuild, the mean of a wheel's contact points |
| `sim/docking.ts` | `jointSpin`: angular momentum about the joint centre |
| tests | `physics/contacts` (thin slab guard), `sim/load-range`, `sim/frame-merge`, `sim/ground-tiles`, `sim/ground-supports`, `sim/docking-momentum`, `sim/ground` (legs, now under 0.5 m/s) |

## Findings

- **C1:** Rapier stops a thin slab at 400 m/s against a fixed one without CCD in this build (its contact prediction). With CCD on, a plane rolling at 70 m/s stuck to the ground, so there is none; the test is a guard.
- **C2:** an idle portless vessel on rails was flown through: a craft 30 m behind it at 1 m/s ended 10 m ahead. The load range fixes it. Debris that separates from a controlled vessel now stays in flight until it is 2 km (plus the closing speed over 5 s) away; `debris.test.ts` expected rails within 3 s and now flies the debris out of range first.
- **C3:** two frames closing at 50 m/s passed through each other (900 m behind after the meeting); merged at 2 km they collide.
- **C5:** a plane fitted 12 m above a neighbour's ground lifted it 0.14 m/s; isolated tiles do not.
- **C4:** built as a height-field patch (a lattice of cached terrain heights, 96 m patches) and dropped. A height field has no thickness (a plane that landed at 5 m/s ended 0.4 m inside the ground); Rapier gives its manifolds no solver contacts, and rebuilding the contact points from the narrow phase made the tyre model's side grip go unstable above 75 m/s (the old solver points trailed the wheel by `v·dt`, which stabilised it by accident); heights 170 m from the body origin made a resting pod rock. What stays is a thick plane raised to the highest terrain under the vessel's supports.
- **F3 as a by-product:** a lander deploying its legs on the ground no longer jumps 0.7 m/s: the rebuilt body is lifted out of the ground by the feet's depth. The plan's 0.5 m/s now holds.
- **Wheel contact points:** the tyre model halved pairwise (leaning to the last point); it is the mean now.
- Rover test: the rover here has a 2 m wheelbase and a 3 m wide, 1 m bump instead of the plan's 20 m and 2 m.

## Not done

- One plane per support, so that a rover's rear wheels follow the ground while the front ones are on the bump (they stand above it by the bump's height).
- A landed vessel on surface rails near a controlled one is not woken by the load range.

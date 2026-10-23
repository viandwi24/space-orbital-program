# 390 — Separation and deploy without flinging

**Plan:** [plans/390-separation-and-deploy-without-flinging.md](../plans/390-separation-and-deploy-without-flinging.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0334 (0018, 0269, 0261) · **Note:** [refs/graphics-v2/04-physics-fling-and-collision.md](../../refs/graphics-v2/04-physics-fling-and-collision.md)

## What was done

| Where | What |
|---|---|
| `core/physics-backend.ts`, `physics/rapier-backend.ts`, `mock-backend.ts` | `setPairContacts` / `ignoredPairs`; Rapier hook `filterContactPair` (needs an `EventQueue`) |
| `sim/frames.ts`, `vessel.ts`, `debris.ts` | `graceBetween`, `stepGrace`; split and debris spawn use it; `refreshColliders` keeps the centre of mass and the angular momentum |
| `sim/robotics.ts` | `applyJoint` returns what moved; the vessel's offset spin counters the parts' angular momentum |
| `stock/animate.ts`, `parts/missions.ts` | `ModuleBay.hollow` follows `jettisoned`; walls on the cargo bay |
| `sim/hooks.ts`, `commands.ts`, `stock/modules.ts` | a decouple inside a closed bay is refused with the bay's name; staging fires the rest and emits `stage:blocked` |
| tests | `physics/contacts`, `sim/bay-jettison` (petals, cargo release, refusal, bay drag), `sim/robotics` (swinging arm), `sim/ground` (legs), `sim/transfer` (a pump), `stock/hollow-parts`, `web/owner-fling-cases` (Wayfarer, Kronos; far and in orbit) |

## Findings

- The Kronos fling reproduced headlessly and is fixed (F0 grace pairs; the hollow ring and the walled cargo bay). The Wayfarer fling did **not** reproduce, far or in a 300 km orbit, whether on rails and woken or not; the two tests stay as guards (|Δv| under 0.5 m/s, spin under 5°/s).
- Hinge: the centre of mass drifts under 1 cm over a 90° swing, and the vessel has no residual spin after the joint stops.
- F5 (`setMass`): Rapier keeps the velocity of the centre of mass when the mass moves; correcting for the spin made momentum worse, so it was left alone.
- F1 (spawn clear) was not needed once F0 and the hollow ring were in; F3 (gradual colliders) was not done: legs on the ground lift the ship 0.7 m/s for 0.3 s, which the guard test allows up to 1 m/s (the plan asked for 0.5).
- Not saved: the pair set. A load starts with none.

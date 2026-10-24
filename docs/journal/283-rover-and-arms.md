# 283 — Rovers, part two: suspension, an external seat, scanning arms, surface features, the drill's rig

**Plan:** [plans/283-rover-and-arms.md](../plans/283-rover-and-arms.md) · **Session:** Worker B, 2026-10-24 · **ADR:** 0354 (0161, 0262, 0068, 0092, 0178) · **API:** 0.1.128

## What was done

| Where | What |
|---|---|
| `sim/frames.ts`, `state.ts`, `core/definitions.ts`, `stock/modules.ts` | wheel suspension: `travel`/`spring`/`damper`, a hub collider, the spring and damper along the ground's normal at the tile, tyres inside the travel count as in contact, `compression` in state and snapshot; the rover wheels have it |
| `sim/hooks.ts`, `core/definitions.ts` | `vessel.nearestFeature(reach, point)`: the stone lattice's rock nearest a part point; `needs.feature` on an experiment |
| `stock/science.ts`, `parts/missions.ts` | `stock.rock-study`; `stock.scan-arm-s/m/l`; `stock.seat-external`; tech: with the rover cab |
| `renderer/generators/rover-gear.ts` | `scan-arm`, `seat-external`, `drill-rig`; the drill remodelled |
| tests | `sim/test/suspension.test.ts` (placed on its hubs the rover is lifted onto its springs, rebounds under a quarter of the lift and rests steady to 3 mm, every wheel at 0.2–0.95 of its travel), `sim/test/surface-features.test.ts` (a rock under the part is found, the same one each time; none out of reach, none on clear ground), `stock/test/part-support.test.ts` (the arm runs only with a rock in reach and yields a result), rover and wheel-motor tests still pass |

## Choices

- The rock study's value is small (8): the tech pacing test counts every landed experiment at Home, though only Cinder has rocks, and tier 3 must stay out of reach of Home alone.
- The ground is one plane under the vessel, so bumps are stones; the plan's 0.3 m step is therefore left as a drop that settles.

## Open

Visible wheel travel; features on Home; spring tweakables in the Hangar; screens (the catalogue thumbnails of the arm, the seat and the drill were not taken); the owner's look.

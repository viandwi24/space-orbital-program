# 0354 — Rover suspension, scanning arms that study rocks, the external seat and the drill's rig

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/283-rover-and-arms.md
**Builds on:** ADR 0161 (wheels), ADR 0262 point 8 (suspension is a force inside the one body), ADR 0068 and 0092 (the stone lattice), ADR 0178 (science), ADR 0317

## Decision

1. **Suspension is a spring and damper along the ground's normal, with the hub as the bump stop.** A wheel's config takes `travel` m, `spring` N/m and `damper` N·s/m. Its collider is a hub `travel` smaller than the tyre each way (`WheelSpec.suspension` carries the three numbers to the sim). Each step the sim finds the wheel box's extent along the tile's normal (the support of the rotated box), the centre's height over the tile's top face and how far the full tyre sinks into it; a tyre pressed in pushes back with `spring × compression − damper × closing speed` (never negative, at most 1.5 × spring × travel), at the ground point under the wheel, and counts as in contact for the tyre forces even where the hub does not touch yet. The hub's physical contact takes over beyond the travel. Stock rover wheels: S 0.07 m, 20 kN/m, 3 kN·s/m; M 0.12 m, 45 and 6; L 0.2 m, 110 and 14. A wheel with no travel (landing gear) is as before. The compression (0..1 of the travel) is written into the wheel's module state each step and shows in the snapshot (`compression`).
2. **The arm is a drawn boom and a reach check, not a joint.** `stock.scan-arm-s/m/l` (reach 1.4, 2.6, 4.5 m) carry `stock.experiment` for the new `stock.rock-study` (landed only; `needs.feature`): the run starts only when `vessel.nearestFeature(reach, tip)` finds a rock, and it yields an ordinary science result, which repeats at half value (as the other experiments). A kinematic arm (plan 306) is for the player's own articulated arms; this one has nothing to move but its picture.
3. **Surface features are the stone lattice**, so tests and saves agree: `nearestFeature` (a new optional `VesselApi` method, hooks.ts) looks up `stonesAround` the arm tip's ground point on the body-fixed frame and answers the nearest rock within reach, as `{ id: "body:face:i:j", kind: 'rock', distance, radius }`. Only the cratered airless bodies have stones to study (Cinder; not Home, whose rocks of plan 402 are another, visual lattice): the arm yields on the Moon, not at the pad.
4. **The external seat** `stock.seat-external` is a crewed part (one seat) with no command module and no hull, on a stack node; it shows a chair, a harness and a life-support pack. The drill's rig (`stock.drill`, still hidden until plan 386) is drawn by `drill-rig`: collars, struts, a motor housing, a stem with auger flights and a bit.
5. **Mod API 0.1.128**: additive (`VesselApi.nearestFeature`, `ExperimentDefinition.needs.feature`, `WheelSpec.suspension`, the wheel module's `travel`/`spring`/`damper`, `stock.experiment`'s `reach`/`tip`).

## Left open

A visible travel of the wheel model (the compression is in the snapshot; the renderer does not slide the tyre yet); the 0.3 m step at 5 m/s of the plan (the ground tile is a plane, so a step is a stone: the test is a drop that settles, not a bump); features on Home; the Hangar's tweakables for the springs; the owner's look at the arm, the seat and the drill.

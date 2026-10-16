# 0035 — Lifting surfaces: `VesselApi.airVelocity` and the stock fin

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/026-part-visual-follow-ups.md

## Context

The sim has drag only (ADR 0017: no lift, no fins), so a rocket's stability depends on mass layout alone and fins would be decoration. A mod needs the airflow at a part to write any aerodynamic module, and the stock content must use the public SDK (ADR 0005).

## Decision

- `VesselApi.airVelocity(point?: Vec3): Vec3` (API 0.1.8, additive): velocity of the point (part frame, the part origin by default) **relative to the air** (the atmosphere co-rotates with the body, ADR 0017), expressed in the part frame, m/s. It includes the vessel's rotation. Flight mode only (throws on rails, like `applyForce`). Vacuum gives the plain velocity; modules scale by `ambient.density`.
- `stock.fin` (module, config `area`, `liftSlope` 2.0, `crossflow` 1.2, `centre` in the part frame): the plate lies in the part's X-Y plane, normal along local Z. With `V` the airspeed at the centre of pressure and `sin a = v_z / V`, `cos a = hypot(v_x, v_y) / V`, the force along local Z is `-1/2 rho V^2 S (liftSlope sin a cos a + crossflow sin a |sin a|)`, applied at `centre`. Small `a` gives the linear lift slope; large `a` a stalled plate whose force grows with the cross-flow, so it cannot fight the flow without limit. Derivation and the constants that could not be confirmed online: `research/fin-aerodynamics.md`.
- The default per-part drag still applies to the fin's box, so its cross-flow is slightly over-counted at large angles; accepted (conservative, only above about 30 degrees).
- Control surfaces (a commanded deflection) are not part of this plan.

## Alternatives considered

- **A `lift` field in the part definition handled by the sim.** Faster, but only fins and only this model; the capability serves any mod's aerodynamics.
- **Per-body-axis lift in the existing drag code.** Would give every cylinder lift and hide the stabilising effect the player buys with fins.

## Consequences

- A finned rocket gets a restoring moment about its centre of mass when the fins sit behind it, and angular damping from the fins' velocity at their centre. Verified in `packages/sim/test` (restoring sign, a finned vs unfinned vessel left to itself).
- Unfinned vessels fly exactly as before (determinism pinned).

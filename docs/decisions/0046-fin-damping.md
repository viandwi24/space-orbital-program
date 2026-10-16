# 0046 — Aerodynamic damping of fins

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/033-part-assets-effects-and-aero-follow-ups.md

## Context

Journal 026: the fin gives a restoring moment but the rocket only oscillates (0 to 7 degrees, period about 5 s). The fin already feels the rotation (`airVelocity` includes `omega x r`), so a quasi-steady damping moment `-1/2 rho V S C_Na L^2 q` exists, but for a 25 t, 20 m rocket at 1.5 km/s it is about 0.006 per second of the moment of inertia: a decay of well under 1 % per cycle. Real vehicles are damped by body-fin interference, downwash lag on the tail (the tail meets the angle the wing had a moment earlier) and the guidance loop; none of these is modelled.

## Decision

`finConfigSchema.damping` (default 60, `stock.fin` and `stock.control-surface`): the rotational part of the airflow at the centre of pressure (`airVelocity(centre) - airVelocity(centreOfMass)`, normal component `w`) is counted `1 + damping` times: an extra force `-1/2 rho V S liftSlope damping w` along the plate normal, with `V` the airspeed at the centre of pressure. It is a model constant standing for the unmodelled effects above, not a measured one (research `gimbal-damping-and-effects.md`). It vanishes with `rho V`, so it does nothing in vacuum and little at low speed, and it acts only against the rotation (never on a translational flow). Stability of the explicit step: `damping` is limited by `(1 + damping) * dt * c / I < 1` with `c/I` about 0.006 /s (checked by the finned-booster test at the stock value of 60; the schema caps `damping` at 100).

Measured effect (tests): after one oscillation period the peak angle of attack of the coasting finned booster rocket is at most 0.6 of the first peak (measured 0.47) with the stock damping, and at least 0.9 with `damping: 0`.

## Alternatives considered

- **Pure quasi-steady damping:** physically what the model already has; invisible in play.
- **A vessel-wide angular drag:** damps unfinned rockets too and rotation in vacuum-like air; wrong for tumbling bare stages.
- **Making the player's guidance do it:** the point is that a coasting rocket should settle on its own.

## Consequences

- Fins now settle a perturbed rocket instead of ringing; a rocket with a pitch-over in progress meets some extra resistance, tested by the ascent test.
- `damping: 0` restores the plan-026 behaviour exactly (determinism pinned in a test against the old force).

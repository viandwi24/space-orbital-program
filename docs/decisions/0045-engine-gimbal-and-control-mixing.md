# 0045 — Engine gimbal, control surfaces and the attitude mixer

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/033-part-assets-effects-and-aero-follow-ups.md

## Context

Journal 026: a finned 25 t rocket could not pitch over with one reaction wheel at high dynamic pressure (5 kN·m against the fins' restoring moment), so the reference Saturn-style rocket needed three wheels. Real rockets steer by tilting the thrust vector; a plane steers by moving surfaces. The sim has one attitude input (`VesselControl.pitch/yaw/roll`, ADR 0015) which only the reaction wheel reads. Engines and control surfaces are mod code: they need two facts the capability API does not give them: where the centre of mass is, and the attitude demand in their own (part) frame.

## Decision

1. **API 0.1.10 (additive).** `VesselApi.centreOfMass: Vec3` (part frame, m; the centre of the vessel's body, so it moves as propellant burns; flight mode only, throws on rails like `airVelocity`) and `VesselApi.torqueDemand: Vec3` (the attitude demand as a torque direction in the part frame: `x` pitch, `y` roll, `z` yaw, each -1..1; the vessel `control` rotated by the part's yaw so a radial part steers correctly; works in both modes).
2. **Mixing rule (one, for every steering actuator).** An actuator that produces a force `F_u` per unit deflection at the point `p` has a torque per unit deflection `t = (p - c) x F_u` about the centre of mass `c`. Its deflection, as a fraction of its range, is `clamp(d . t / |t|, -1, 1) * min(1, |t| / L0)` for the demand `d`, with `L0 = 1` m (an actuator within a metre of the centre of mass has little authority and is not driven to full deflection by a small demand). So demand 0.3 uses 30 % of the range, a lever arm of the wrong sign flips the deflection (an engine above the centre of mass steers the other way), and an actuator with no authority stays still.
3. **Gimbal.** `stock.engine` config `gimbal: { range: degrees, rate: degrees per second }`, default `{ range: 0, rate: 20 }` (no gimbal: existing engines and designs fly bit-for-bit as before). State `gimbal: [ax, az]` (rad): the thrust direction is tilted towards +X by `ax` and towards +Z by `az`, `dir = (sin ax, sqrt(1 - sin^2 ax - sin^2 az), sin az)`. Per step the target comes from the mixer with `F_u = (1, 0, 0)` and `(0, 0, 1)` times the range, and the angle moves towards it by at most `rate * dt` (deterministic slew). Only a lit engine with throttle gimbals; otherwise the angles relax to zero at the same rate. The force is `thrust * dir` applied at the part origin, so the torque is `r x F` by construction (hand calculation in the tests). Snapshot view: `gimbal`. Stock `stock.engine-lv` gets `range: 3`; the booster is a solid motor and does not gimbal. Reaction wheels keep working in parallel (the demand is shared; the player's roll comes from the wheels, a single bell cannot roll).
4. **Control surface.** `stock.control-surface` (module): a fin (ADR 0035 force law, same `area`, `liftSlope`, `crossflow`, `centre`, damping) whose whole plate is deflected about a hinge along its span (local X) by `delta`, up to `maxDeflection` (default 25 degrees) at `deflectionRate` (default 60 degrees per second). The plate normal is `(0, -sin delta, cos delta)`; the force is the fin law on that normal. Mixer: `F_u` is the force per unit deflection at small angle in forward flight, `-k * z-hat` (negative `k`: positive deflection gives force towards -Z), so `delta = -maxDeflection * mix`. State `deflection` in the snapshot (rad). The stock part `stock.control-surface` is a larger fin with the visual kind `control-surface`.
5. **Renderer.** `PartVisual.articulation?: { module, field, mode: 'gimbal' | 'hinge' }` (core schema, additive in the same API bump): the generator's `moving` geometry hangs on a pivot group that the model turns by the snapshot value (`gimbal`: two tilt angles; `hinge`: one angle about X). The plume is a child of the pivot so it follows the bell.
6. **Not here.** Roll from gimbal (single bell), multi-nozzle engines, differential throttle, SAS. Engine direction in the Δv descriptor does not change: the cosine loss of 3 degrees (0.14 %) is far below anything a plan reads.

## Alternatives considered

- **Gimbal inside the sim, outside modules.** Would put an engine concept in the neutral sim and give mods nothing; the two capabilities serve any mod's steering parts.
- **Normalising by `|t|` alone (full deflection for any demand).** Bang-bang for PD controllers and the wrong sign for degenerate arms.
- **Making the reaction wheel weaker or fins weaker instead.** Hides the problem; a rocket that cannot steer without three wheels is the bug.

## Consequences

- A finned rocket with one wheel can fly the plan-007 ascent (test). Scripts and the dev autopilot that command `attitude` steer through the bell as well; their gains were tuned for wheels and are conservative for the stronger actuator.
- Mods with their own steering actuators use the same two capabilities.

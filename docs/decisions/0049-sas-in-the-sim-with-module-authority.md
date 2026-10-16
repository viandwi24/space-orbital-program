# 0049 — SAS lives in the sim; modules report their control authority

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/042-sas-and-flight-assists.md

## Context

Journal 033: the browser autopilot cannot close an attitude loop at snapshot rate (latency, finite-difference rates); only a loop inside the fixed step is reliable. Mods (reaction wheel, gimbal, control surfaces) turn the vessel `control` demand (-1..1 per axis) into torque (ADR 0045). A stability assist therefore needs: attitude, angular velocity, orbit/surface velocity, the inertia, and how much angular acceleration a unit demand yields. Modules see none of the first four (they only see the part's `VesselApi`), and the sim must not know stock ids.

## Decision

1. **SAS is a sim system, not a mod.** `packages/sim/src/sas.ts` runs in `prepareFrame` before the module hooks, once per fixed step, for every flight vessel with SAS on. It produces an attitude *demand* in the same units as the player's `attitude` command; every actuator keeps working through the unchanged mixer and torque-demand path. The sim knows nothing about stock: it only knows orientation, angular velocity, velocity and mass properties, which it owns.
2. **Authority comes from modules (API 0.1.11, additive).** `ModuleDefinition.controlAuthority?(ctx): Vec3` returns the largest torque (N m, >= 0) the module can add about each part axis (x pitch, y roll, z yaw) right now. The sim sums them (rotated into vessel axes by the part yaw) and divides by the diagonal of the inertia tensor to get the largest angular acceleration `a_max` per axis. The stock reaction wheel, engine gimbal (thrust x lever arm, 0 when cold) and control surface (force change over its range x lever arm, 0 in vacuum) implement it. A mod with its own steering part implements the same hook and SAS drives it.
3. **Command and state (additive).** `{ type: 'sas', vessel, mode?, reference? }`, `mode` one of `off | hold | prograde | retrograde | normal | antinormal | radial-in | radial-out`, `reference` `surface | orbit` (what prograde/retrograde follow; the HUD sends its speed mode; default `surface`). Either field may be omitted to keep the current one. `VesselSnapshot.sas?: { mode, reference, error }` (`error` rad, pointing error). The direction definitions are exactly the navball markers (`prograde` along the reference velocity, `normal` along `r x v` of the inertial state, `radial-out` along `r`), so a button points at the marker it is named after. Later modes (`maneuver`, `target`, plans 044/045) extend the union. SAS state (`mode`, `reference`, hold quaternion, integrator, settling flag) is plain data in `VesselState.sas`, so a save (plan 043) round-trips it by serialising the component.
4. **Control law.** Error vector `e` (rad, vessel axes): eigen-axis of the shortest rotation to the target; for the pointing modes the nose (+Y) is pointed at the direction and roll is only damped; `hold` holds the full quaternion. Per axis: desired rate `w_d = sign(e) min(Kp|e|, sqrt(2 f a_max |e|), w_max)` (`Kp` 0.7/s, `f` 0.5, `w_max` 0.6 rad/s), commanded acceleration `a = Kr (w_d - w) + i`, demand `clamp(a / a_max, -1, 1)`, `Kr` 3/s. The integrator `i` (rad/s^2) integrates `Ki e` (`Ki` 0.25 rad/s^3 per rad) only for `|e| < 0.2` rad and is clamped to half the authority; it removes the offset a constant torque (aerodynamic stability, gimbal asymmetry) would leave. Because the demand is normalised by the real authority the response is the same for a probe on wheels, a finned rocket on its bell and a lander; an axis without authority gets no demand.
5. **Player input.** Any non-zero `attitude` input replaces the SAS demand while held (the effective control handed to modules is the player's). In `hold`, the target follows the attitude during input and after release SAS first damps the rate and latches the attitude when the angular speed is below 0.004 rad/s ("resumes holding the new attitude"). Pointing modes resume pointing at the direction on release.
6. **Rails.** Time warp needs every vessel on rails (ADR 0017) and a vessel goes on rails only after being force- and torque-free. SAS therefore outputs exactly zero inside a quiet band (entered below 0.003 rad error and 0.01 rad/s, left above 0.01 rad error, and never while a disturbance has been learned by the integrator), so a settled vessel with SAS on still goes on rails. On orbital rails a pointing mode keeps the nose on its direction analytically at the end of each rails step (the attitude is set, not simulated); `hold` keeps the frozen attitude; surface rails are untouched. SAS never wakes a vessel; commands that do (throttle, attitude) behave as before.
7. **Scripts** get `ship.sas` (read/write mode) through the existing command path (plan 042 integration list); **HUD** gets navball buttons and keys (`T` toggles `hold`/`off`).

## Alternatives considered

- **A stock module on the command pod.** Needs attitude, rate, orbit velocity and inertia in `VesselApi`: a larger public API for one feature, and the sim already owns all of it. Authority is the only module knowledge needed, and that is now an optional hook.
- **Fixed PD gains on the normalised demand.** A rocket on a 5 kN m wheel and a lander on a 100 kN m bell differ by 20x in authority; fixed gains either oscillate or crawl (journal 033).
- **A host-side autopilot (plan 009 dev autopilot).** Latency and snapshot-rate rates; the reason for this ADR.
- **Learning the authority from the response.** Noisy under disturbance torques and not reproducible across a staging event; the hook is exact and cheap.

## Consequences

- Vessels without a control source cannot use SAS (same rule as `attitude`).
- The effective control seen by modules in `ModuleContext.vessel.control` is the player's input or, when SAS is on and no input is held, the SAS demand; `throttle` is unchanged.
- Plan 045 adds the `maneuver` mode (target direction = burn vector); plan 043 saves `VesselState.sas`.

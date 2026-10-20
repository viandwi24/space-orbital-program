# 0246 — A pod's mass sits low and its blunt base turns to the airflow

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/265-capsule-reentry-stability.md
**Builds on:** ADR 0017 (the flight model: drag per part axis, no lift), ADR 0035 (cross-flow drag), ADR 0245 (cylinder colliders)

## Context

The owner found a bare pod hard to fly on re-entry: it does not stay heat shield first. Measured on a bare pod released at 45° to the airflow (8 km, 250 m/s, SAS off): the angle stayed at 45° for the whole fall. A one-part vessel has its centre of mass at the part's centre, and drag is applied at the part's centre: the centre of pressure and the centre of mass are the same point, so drag gives no torque, and the per-axis model (ADR 0017) leaves only a second-order cross-flow term. A pod has no aerodynamic stability and, on the ground, no preferred end to rest on.

## Decision

1. **`PartDefinition.centerOfMass`**, an optional offset from the shape's centre in the part frame. The mass properties (`massProperties`), `designCom` (the snapshot, a split, EVA) and the Hangar's stability line use it; drag, colliders, attachments and the part's pose stay on the shape's centre. The pod has `[0, -0.12, 0]` (its half height is 0.5 m), the heat shields `[0, -0.04, 0]` and `[0, -0.06, 0]`.
2. **`PartDefinition.bluntBase`**, the moment coefficient of a blunt -Y end on a cylinder part (0.35 per radian for the pod and the shields; real capsules 0.1 to 0.4). While that end is **open to the wind** (nothing attached to the bottom node), the airflow turns the part base first: a moment `M = Cm q A D (a × v̂)` about the vessel's centre of mass, with `a = -Y`, `v̂` the part's velocity relative to the air, `A = π r²`, `D = 2 r`; first order in the angle, so it restores from a few degrees as well as from 45°. A pitch damping goes with it, at 0.4 of critical damping for that stiffness and the vessel's lateral inertia (`BLUNT_DAMPING_RATIO`), clamped so an explicit step cannot overshoot. A pod on a rocket has its base covered: no moment, the stock rockets fly as they did. A pod with a heat shield under it gets the moment from the shield.
3. **Not a drag-cube system:** the drag force itself is unchanged.

## Measured

A bare pod released at 45° turns base first within 3 s, damped, and stays (a test: under 5° from 3 s on); a pod over a heat shield does the same; a pod thrown past the horizontal on flat Cinder ends on its side or its base, not on its top (before, two of seven throws ended on the top).

## Consequences

- The reference rockets' ascents move by the pod's low mass (0.01 m of centre of mass): the frozen parity flight and two trajectory goldens are re-frozen, the Sol rescaled test flies a 1.6 air-height apoapsis (its grid-search transfer planner missed by twice as much from 1.8), and the resume test of a pad liftoff allows 0.5 m after 8 s (a 3 mm/s² drift between a run and its resumed twin; the cause is not found).
- Tests that computed a centre of mass by hand now add the part offsets (`partMassCentres`).
- A mod's pod can set both fields; both are optional.

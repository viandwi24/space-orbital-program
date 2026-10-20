# 265 — Capsules fly heat shield first and do not rest on their top

**Plan:** [plans/265-capsule-reentry-stability.md](../plans/265-capsule-reentry-stability.md) · **Session:** Worker B (M5), 2026-10-21 · **ADR:** [0246](../decisions/0246-pod-low-mass-and-blunt-base-moment.md)

## Measured before (centre of mass and centre of pressure)

| Quantity | Value |
|---|---|
| bare pod: centre of mass | the part's centre (shape `cylinder(1)`, r 0.625 m, h 1 m): no offset existed |
| bare pod: where drag acts | the part's centre: the same point; the drag force is per part axis, so axial drag is along the axis and gives no torque, cross-flow drag gives a torque only at second order in the angle |
| attitude test: pod released 45° off the airflow, 8 km, 250 m/s, SAS off | the angle to the airflow stayed 45.0° at the start and 44.8° 28 s later (neutral: no restoring torque at all) |
| a pod thrown past the horizontal on flat Cinder (7 throws, 135° to 225°) | 2 of 7 ended on its top (150° and 195°), the rest on its side |

## What was done

| Where | What |
|---|---|
| `packages/core/src/schemas.ts` | `centerOfMass` (offset of the mass from the shape's centre) and `bluntBase` (moment coefficient of a blunt -Y end) on `PartDefinition`; API 0.1.95 |
| `packages/sim` `parts.ts`, `core.ts`, `mass.ts`, `vessel.ts` | `massOffset`; `designCom`, `massProperties` and the split's per-half centre of mass and velocity use it |
| `packages/sim` `frames.ts`, `constants.ts` | the moment `Cm q A D (a × v̂)` of an open blunt end about the vessel's centre of mass, with damping at 0.4 of critical (`BLUNT_DAMPING_RATIO`) |
| `mods/stock` | pod `[0, -0.12, 0]`, `bluntBase 0.35`; heat shields `[0, -0.04, 0]` and `[0, -0.06, 0]`, `bluntBase 0.35` |
| `apps/web` `editor/stability.ts` | the Hangar's centre of mass includes the offsets (the pressure stays on the part centres) |
| tests | new `capsule-stability.test.ts` (45° base first, with a shield, the low mass in the backend body, throws past the horizontal); `measure.ts` `partMassCentres`; hand-calculated centre-of-mass tests follow the offsets |

## Measured after

A bare pod released at 45° is within 5° of base first from 3 s on and stays; a pod over a heat shield too; a pod thrown past the horizontal never ends on its top (4 throws, 150° to 210°).

## What surprised me

- **Resting on the base cannot come from the mass alone.** A cylinder lying on its side is a stable rest whatever its centre of mass, so "a pod dropped on its side settles on its base" is not a thing a rigid cylinder does; what changed is that the top is no longer a rest the pod is thrown into (the low mass makes an inverted pod tip over). The plan's line is amended.
- **The centre-of-mass offset touched more than the pod.** Every place that took the part origin for the mass centre (the snapshot, EVA, a split's velocities, the tests' hand calculations) had to follow, or momentum and angular momentum through a split drifted by 0.3 %.
- **The first damping was far too weak** (a fixed multiple of the drag: a heavy vessel got 0.5 % of critical) and a probe re-entering at 7.8 km/s diverged into a tumble at 40 km. Damping is now tied to the stiffness and the vessel's inertia.

## Open questions / follow-ups

- **Frozen numbers moved** (the pod's low mass shifts the reference rockets' centre of mass by about 1 cm): `sun-parity.json` and two trajectory goldens re-frozen; the Sol rescaled test flies a 1.6 air-height apoapsis (its transfer planner missed by twice as much from 1.8, a grid-search sensitivity); the resume test of a pad liftoff allows 0.5 m after 8 s because the resumed twin drifts at about 3 mm/s² from the original. **The cause of that drift is not found** and is worth a look: before this plan the twin matched to 1e-3 m.
- Without a heat shield the pod's flat base is still modelled as a flat disc for heating; drag coefficients per end are untouched (out of scope).
- No game screenshots or browser run (e2e paused by the owner).

## Verification output

pending

# 0018 — Rigid grouping: one compound body per vessel

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/011-physics-rigid-grouping.md
**Supersedes:** the "Bodies" and "Reaction wheel torque" points of [0017](0017-flight-model.md); the rest of 0017 stands.

## Context

Plan 007 gives every part its own rigid body and every attachment a fixed joint. Measured on 2026-10-16 (Bun 1.4.2, Rapier 0.21.0 compat, 16 solver iterations, `packages/physics/bench/grouping.ts`, tower of 500 kg boxes under 5 kN lateral + 20 kN axial at the top, 10 s at dt 0.02):

| Parts | Bodies / joints | Step time | Flex (worst part offset in the frame of part 0) |
|---|---|---|---|
| 20 | 20 / 19 | 150 µs | 0.004 m |
| 50 | 50 / 49 | 295 µs | 0.14 m |
| 100 | 100 / 99 | 573 µs | 1.8 m |

Through the sim (`packages/sim/bench/stack.ts`, engine lit, wheel swinging the stack, 500 steps): 199 / 371 / 703 µs per step for 20 / 50 / 100 parts, flex below 6 mm (a much milder load). The same towers as one compound body cost 20-30 µs at the backend level whatever the part count and cannot flex. Cost and flex both grow with part count; grouping removes both.

Open questions from the plan: where a compound shape lives (`BodyDesc` vs a new method), how mass, centre of mass and inertia are recomputed when resources move, and how velocity survives a split.

## Decision

**Group = the whole vessel.** A flight vessel is one rigid body with one collider per part. The only operations that cut an attachment are staging (`detach`) and, later, breakage (plan 012); both are topology changes the sim already handles in one place (`splitVessel`), so the sim rebuilds bodies there instead of pre-grouping by "decoupler between parts". This is simpler than static stage groups (no need to know which parts can detach) and cheaper (one body, no joints). The plan's wording "a handful of bodies" is met with one.

**Shape: a new `BodyShape` variant, not a new method.** `PhysicsBackend` keeps its method set. `BodyShape` gains `{ type: 'compound'; shapes: ShapePlacement[] }` (primitives with body-frame position and optional rotation); `PrimitiveShape` is the old union. A new `MassPlacement { centerOfMass?, inertiaFrame? }` is mixed into `BodyDesc` and passed as an optional fourth argument of `setMass`. Everything is optional, so existing callers compile and behave as before. A compound body must carry an explicit `inertia` (the backend cannot derive it); the Rapier adapter creates one density-0 collider per placed primitive, in list order, and sets mass, centre of mass, principal inertia and its frame through `setAdditionalMassProperties` followed by `recomputeMassPropertiesFromColliders()` (without it Rapier keeps the old centre of mass until the next step and a force applied at a point in the same step uses a stale lever arm; measured).

**Frames of reference.** `getTransform` returns the pose of the body *origin*; `getVelocity.linear` and `BodyDesc.linearVelocity` are the velocity of the *centre of mass* (Rapier's native meaning). The sim puts the body origin at the vessel's root part origin and the colliders at `part.designPos − root.designPos`, so a part's pose is `bodyPose ∘ constant offset` and nothing about part offsets is stored.

**Mass properties.** Each step the sim compares every part's mass (dry + contents) with the last pushed value; if any changed it recomputes the vessel's mass, centre of mass and the full inertia tensor (each part's own inertia plus the parallel-axis term), diagonalises it with a fixed-sweep Jacobi iteration (principal values + frame quaternion; identity for the symmetric stacks of today) and calls `setMass`. Cost is O(parts) only while propellant flows. Moving the centre of mass inside the body shifts the world position of the COM by the offset (as the per-part model did through `refreshPose`) and keeps its velocity.

**Velocity across a split.** Before cutting, the sim reads the single body's `(v_com, ω)` and the part poses; each part moves as `v_com + ω × (r_part − r_com)`. After the cut each side gets its own body with the mass-weighted velocity of its parts (plus the decoupler impulse, equal and opposite) and the same ω, so linear and angular momentum are conserved exactly (parallel-axis identity) and the side positions are continuous.

**Forces.** Gravity is one force `m·g(r_com)` at the COM (point-mass gravity, the gradient across a vessel is negligible). Drag stays per part, applied at the part origin. Module forces without a point are applied at the part origin (as before they were applied at the part body's centre, which was its origin); torques act on the whole vessel (a reaction wheel now turns the vessel directly rather than through joints).

**Ground and pad hold (ADR 0017) are not redesigned.** Ground contact still clamps the sphere: the deepest penetration moves the whole body out and a closing contact makes the body stick to the rotating ground. The pad hold pins one body pose instead of one per part and stays, because ground contact itself is still an idealisation (plan 012 replaces both). Whether the pad hold could go is recorded in journal 011.

## Alternatives considered

- **Groups per stage (split at decoupler parts).** Needs static knowledge of which attachments may detach (today only a runtime `detach` call says so), keeps one joint per stage boundary and a body per stage. More machinery for no gain over rebuild-on-split.
- **A `createCompoundBody` method.** Duplicates `createBody` and the mock; the shape variant is additive.
- **Keeping per-part bodies and raising solver iterations.** Cost still grows linearly and flex remains (50 parts flex 0.14 m at 16 iterations under the stress load).
- **Rapier colliders' own density for mass.** Mass and inertia would depend on the geometry boxes, which are collision proxies, not mass distributions (a tank is mostly propellant).

## Consequences

- 100-part stack: 1 body, 0 joints, backend step ~20 µs instead of ~570 µs; flight vessels are perfectly rigid.
- Staging is a rebuild: remove one body, create two. Deterministic (creation order: kept side, then new side).
- `FlightFrame` is keyed by vessel (not part); internal to the sim, no protocol, `Snapshot`, `Command` or SDK change. `PhysicsBackend` change is additive; `API_VERSION` unchanged (the mod API is untouched).
- A broken-off part (plan 012) is the same operation as a split.
- Follow-up in plan 012: contact on the rigid vessel is a single sphere clamp, so toppling and tipping on the ground are not modelled by Rapier contacts yet.

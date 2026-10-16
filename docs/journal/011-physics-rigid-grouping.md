# 011 — Physics rigid grouping (compound bodies)

**Plan:** plans/011-physics-rigid-grouping.md · **Session(s):** grouping session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` (benchmark, Rapier API check, ADR, concrete criteria), then implemented. No scaffolding, no new dependencies.

| Area | Change |
|---|---|
| core | `PhysicsBackend` (additive): `BodyShape` gains `compound`, `PrimitiveShape`, `ShapePlacement`, `MassPlacement` (`centerOfMass`, `inertiaFrame`) in `BodyDesc` and as 4th arg of `setMass`; semantics documented (`getTransform` = body origin, velocities = centre of mass) |
| physics | adapter creates one density-0 collider per placed primitive; mass properties through `setAdditionalMassProperties` + `recomputeMassPropertiesFromColliders`; validation for compound; mock accepts compound; `test/compound.test.ts` (7 tests); `bench/grouping.ts` |
| sim | one body per vessel: `state.ts` (`FlightBody`, single-pose `PadHold`), `mass.ts` (mass, COM, inertia tensor, Jacobi), `frames.ts` (body creation, part pose = body pose ∘ offset, rigid-body part velocities, gravity at COM, drag at parts, pad hold and ground on the rigid body, re-anchor), `vessel.ts` (split = remove one body, create one per side), `hooks.ts`, `snapshot.ts`, `sim.ts` (splits after the step); `test/grouping.test.ts` (8 tests), `bench/stack.ts` |
| docs | ADR 0018 (+ index, 0017 status note), `simulation.md`, `research/rapier.md`, glossary, spec line, plan 011, STATUS |

Public API untouched: `createSim`, `Snapshot`, `Command`, `VesselDesign`, SDK, `API_VERSION`.

## Benchmark before / after (Bun 1.4.2, Rapier 0.21.0 compat, 16 solver iterations, 100-step warm-up)

Backend only (`bun packages/physics/bench/grouping.ts per-part|compound`): tower of 500 kg boxes, 5 kN lateral + 20 kN axial at the top, 10 s.

| Parts | Per part: bodies / joints | step | flex | One compound body: step | flex |
|---|---|---|---|---|---|
| 20 | 20 / 19 | 139-150 µs | 0.004 m | 19-30 µs | 0 |
| 50 | 50 / 49 | 295-307 µs | 0.14 m | 20-22 µs | 0 |
| 100 | 100 / 99 | 573-606 µs | 1.8 m | 24-25 µs | 0 |

Whole sim (`bun packages/sim/bench/stack.ts`, stock tower in free fall from 60 km, engine lit, wheel swinging the stack; measured with the same bench on the pre-change commit via a throwaway worktree): 180 / 385 / 735 µs per step for 20 / 50 / 100 parts before, 62-70 / 97-99 / 140-145 µs after (about 19 % at 100 parts). The remaining cost is per-part sim work (module hooks, drag, mass checks, ~0.8 µs per part), not Rapier.

## What surprised me

- **Rapier applies new mass properties at the next step.** The first compound test failed: a force at a point on the first step saw the old centre of mass (30 N·m of torque from a 1 m error). `recomputeMassPropertiesFromColliders()` after `setAdditionalMassProperties` fixes it. The same applies to `setMass` while a step's forces are queued.
- **Rebuilding a body drops its queued forces.** `processPending` used to run between `prepareFrame` and the backend step; with bodies recreated on a split, hook-requested detaches would lose a step of gravity, thrust and drag (0.2 m/s). Splits now run after the backend step. Detaches from `onStage` run in `dispatch`, between steps, where no force is queued.
- **`scenario-orbit` changed outcome.** The rigid vessel flew a slightly different ascent and the helper's crude circularisation timing (burn time `dv·m/F`, ignores the vessel getting lighter) started 6 s early: the burn ran past apoapsis and e went from 0.043 to 0.126. Using the rocket equation in the test helper centres the burn (e 0.026). Criteria untouched; plan 007 said the helper may be tuned.
- The old setMass spy test compared against the tank's mass; there is now only the vessel's.
- Angular-momentum conservation across a split was first measured about a fixed point with 1.2e6 N·s of orbital momentum and failed at 1.7 % because the body COM lags the parts by one step of burn; measuring in the COM frame (subtract the mean velocity) is the right invariant. A mutant that zeroes the angular velocity at the split fails the test.
- `diagonalise` returns exactly identity axes for the symmetric stacks of today, so the inertia frame is identity until a part sits off the stack axis (the test plugin hangs a block 0.4 m aside).

## Decisions made

ADR [0018](../decisions/0018-rigid-grouping-compound-bodies.md): group = the whole vessel (rebuild on split) rather than stage groups; compound as a `BodyShape` variant, not a method; body origin at the root part, velocity at the centre of mass; full inertia tensor with Jacobi; split velocities from rigid kinematics. Supersedes the "Bodies" and "Reaction wheel torque" points of ADR 0017.

**Pad hold (ADR 0017): kept, one pose per vessel now.** Experiment: with `holdOnPad` disabled, all sim tests pass (pad test included), because the ground clamp now sticks a rigid stack completely (linear and angular velocity of the ground). Removing it belongs to plan 012 together with the new ground contact; deleting it here would also change what happens to a vessel resting with thrust below weight.

## For plan 012 (ground contact, landing, damage)

- The whole vessel is one rigid body with a box collider per part (`frames.ts createVesselBody`); a real ground collider can contact all of them. Rapier friction/restitution need real values then (colliders have density 0, default friction).
- `applyGround` is still the sphere clamp, now per vessel: deepest penetration moves the whole body, a closing point makes the body take the ground's linear and angular velocity (so a stack cannot topple or tip on it). The pad hold can go once real contact stands a stack up.
- Breakage = `splitVessel` (rebuild both bodies from rigid kinematics); a per-part breaking force needs force readback from contacts, which the backend does not offer yet.
- Colliders are still the placeholder boxes. Collision between the split halves works as before (unjoined bodies collide).

## Open questions / follow-ups

- The body mass lags the part masses by one step (setMass runs in `prepareFrame` before the hooks burn); error 1e-4 relative, same as the old per-part code. Could be tightened by pushing mass after the hooks.
- Gravity acts at the COM only (no gradient torque); fine below km scales.
- No new draft plans needed.

## Verification output

```
$ bun test packages/physics packages/sim packages/core   -> 130 pass, 0 fail
$ bun test                                                -> 272 pass, 0 fail (35 files)
$ bun run typecheck                                       -> 8 workspaces exit 0 (web: 0 errors)
$ bun run build                                           -> done
$ bunx prettier --check packages/core packages/physics packages/sim -> clean
orbit: apoapsis 111.91 km, periapsis 76.13 km, e 0.0258, sim time 217.6 s, wall ~0.3 s
```

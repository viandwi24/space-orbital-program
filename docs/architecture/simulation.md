# Simulation

`@orbital/sim` drives the world. It is a library with a `step(dt)` function and no knowledge of where it runs. Plan 007 implements it and must update this document.

## Loop

```
accumulator += wallDelta * warp
while accumulator >= dt:
    for vessel in world.vessels:
        if vessel.mode == "flight":  stepFlight(vessel, dt)
        else:                        stepOnRails(vessel, dt)
    runSystems("post-physics", dt)
    t += dt
    accumulator -= dt
emit snapshot (throttled to render rate)
```

- `dt` is fixed (0.02 s). The host (web app or test harness) decides how often to call `step` and with which `wallDelta`; `sim` never reads a clock.
- Snapshots are produced on request, not every step.

## Vessel modes

| Mode | When | What runs |
|---|---|---|
| **flight** | thrust > 0, or inside atmosphere, or any part has non-zero external force, or warp == 1 and the player is "in" the vessel | physics backend: rigid bodies + joints per part; modules' `update`; aero system; gravity applied as a force in the local frame |
| **on-rails** | otherwise | position/velocity from Kepler elements at time `t`; modules' `updateOnRails`; no physics backend |

Transitions:
- flight → on-rails: compute orbital elements from state vector (`kepler.fromStateVector`), destroy physics bodies. `fromStateVector` throws `KeplerError` for near-parabolic (`|e − 1| < 1e-8`) and radial trajectories; plan 007 must handle that, e.g. by keeping the state vector and using `kepler.propagateUniversal` for that vessel.
- on-rails → flight: compute state vector at `t`, create physics bodies in a fresh local frame.
- Both transitions are events (`vessel:mode-changed`) that modules and UI can observe.

Time warp above 1× requires every vessel to be on rails; `sim` refuses otherwise and reports why.

## Vessel assembly → physics

- A vessel is a tree of parts from the root (command pod). Each part becomes a rigid body; each parent-child attachment becomes a fixed joint.
- **Rigid grouping (optimisation, planned):** contiguous parts with no decoupler between them are merged into one compound body. Splitting happens on stage/break. Keep the API such that this is an internal change.
- Mass, centre of mass, inertia are recomputed when resources change (every step in flight; cheap for < 100 parts).

## Staging

- Stages are ordered lists of part ids. `stage()` activates the next stage: calls `onStage` on every module of every part in it.
- A decoupler's `onStage` removes its joint and splits the vessel into two vessels; the one without the control source becomes debris (still simulated, goes on rails when idle).

## Resources

- Each part may hold resources (`ResourceContainer` module). Consumers (engines) request a flow per step; the resource system resolves from containers reachable through crossfeed-enabled attachments. Shortfall → engine flames out (event).
- The system is generic: it does not know what "fuel" is.

## Gravity

- Single-body point-mass gravity for MVP: `a = -μ r / |r|³` applied as a force to each rigid body in flight mode.
- On rails, gravity is implicit in the Kepler propagation.

## Atmosphere and aerodynamics (MVP)

- Exponential density `ρ = ρ₀ · exp(-h / H)`.
- Per-part drag `F = -½ ρ v² C_d A v̂` with `A` from the part definition (or bounding-box fallback). Lift is out of scope for MVP.

## Snapshots and commands (sim ↔ host protocol)

Shipped as types in `packages/core/src/protocol.ts` (plan 003). Both are plain data, so the same protocol works in-process and over `postMessage`. The web app will move `sim` into a Worker in plan 009 without changing `sim`.

```ts
interface Snapshot { t: number; vessels: VesselSnapshot[]; bodies: BodySnapshot[] }
interface VesselSnapshot {
  id: EntityId; mode: 'flight' | 'on-rails';
  soi: BodyId;                      // position/velocity are relative to this body (BCI)
  position: Vec3; velocity: Vec3; orientation: Quat;
  parts: PartSnapshot[];            // { id: EntityId; definition: PartId; position; orientation; modules: Record<string, unknown> }
  orbit?: OrbitalElements;          // absent when not expressible (near-parabolic / radial)
}
interface BodySnapshot { id: BodyId; position: Vec3; rotation: Quat } // position in the root-body inertial frame
type Command =
  | { type: 'throttle'; vessel: EntityId; value: number }
  | { type: 'attitude'; vessel: EntityId; pitch: number; yaw: number; roll: number }
  | { type: 'stage'; vessel: EntityId }
  | { type: 'action'; vessel: EntityId; part: EntityId; module: string; action: string; args?: unknown }
  | { type: 'warp'; factor: number }
  | { type: 'load-vessel'; design: VesselDesign };
```

Differences from the earlier sketch: ids are `EntityId`/`BodyId`; vessels carry `soi`; `VesselDesign` is a provisional minimal shape (`formatVersion: 1`, parts with parent links) that plans 006/007 own and may replace. Commands arrive from outside the sim and are not schema-validated in core yet; plan 007 must validate them at the sim boundary.

## PhysicsBackend (`packages/core/src/physics-backend.ts`)

Interface in core; `@orbital/physics` implements it (plan 004): `await createRapierBackend({ solverIterations? })` (async, Rapier 0.21 compat, zero world gravity, one density-0 collider per body, bodies never sleep, joined bodies do not collide) and `createMockBackend()` (sync, no collisions, joints not enforced). Forces are cleared after each `step`; Rapier is f32 and first-order (position error `a·dt·t/8` under constant force); fixed-joint chains are soft, see journal 004 and draft plan 011. Methods: `createBody(BodyDesc)`, `removeBody`, `createFixedJoint(a, b, frameA, frameB)`, `removeJoint`, `applyForce(h, force, point?)`, `applyTorque`, `setMass(h, mass, inertia?)`, `step(dt)`, `getTransform/setTransform` (`Transform = { position, rotation }`), `getVelocity/setVelocity` (`Velocity = { linear, angular }`), `dispose()`. Handles are branded numbers (`BodyHandle`, `JointHandle`). `BodyDesc` has `kind` (`dynamic` default, `kinematic`, `fixed`), `shape` (`box | sphere | capsule`), `mass`, optional `inertia` (principal moments), `position`, `rotation`, optional velocities.

Contract points the adapter must honour: everything is in the local physics frame; forces and torques act for the **next `step` only** and are cleared afterwards (so `sim` re-applies gravity and thrust every step; Rapier's persistent `addForce` must be reset); `Velocity.angular` is about local-frame axes, not body-fixed axes (differs from the "body frame" wording in `units-and-frames.md`, which describes stored vessel state; `sim` converts).

## Determinism

- Fixed `dt`, seeded PRNG, no clock → identical runs. A test will assert that two runs of the same command script produce identical snapshots.
- Rapier is deterministic on the same build; cross-machine determinism is not a goal.

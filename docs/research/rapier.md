# Rapier (JS) — what `@orbital/physics` relies on

Checked 2026-10-16. Package: `@dimforge/rapier3d-compat` **0.21.0** (`npm view` → `latest: 0.21.0`, canary `0.0.0-b716d37-20260925`; matches the catalog pin `^0.21.0`, no change needed).

Sources:
- https://rapier.rs/docs/user_guides/javascript/getting_started_js — compat build, `await RAPIER.init()`, `new RAPIER.World(gravity)`, `world.step()`.
- https://rapier.rs/docs/user_guides/javascript/rigid_bodies — body descs, forces, mass properties.
- https://rapier.rs/docs/user_guides/javascript/colliders — shapes, density/mass properties.
- https://rapier.rs/docs/user_guides/javascript/joints — `JointData.fixed`, `createImpulseJoint` (page is thin; signatures taken from the shipped `.d.ts`).
- https://rapier.rs/docs/user_guides/javascript/integration_parameters — `dt`, solver iterations.
- https://rapier.rs/docs/user_guides/javascript/determinism — WASM build is cross-platform deterministic given identical setup, same version, same creation/removal order; avoid `Math.sin/cos` in setup values.
- Signatures verified against `packages/physics/node_modules/@dimforge/rapier3d-compat/dist/**/*.d.ts` (the docs pages omit parameter names).

## API we use (0.21.0)

| Need | API |
|---|---|
| init (async, once per module instance) | `import RAPIER from '@dimforge/rapier3d-compat'; await RAPIER.init();` |
| world, zero gravity | `new RAPIER.World({ x: 0, y: 0, z: 0 })` |
| timestep | `world.timestep = dt` (same field as `world.integrationParameters.dt`) |
| step | `world.step()` |
| bodies | `RigidBodyDesc.dynamic() / .fixed() / .kinematicVelocityBased()`, `.setTranslation(x,y,z)`, `.setRotation({x,y,z,w})`, `.setLinvel(x,y,z)`, `.setAngvel(x,y,z)`; `world.createRigidBody(desc)`; `world.removeRigidBody(body)` (also removes attached joints/colliders) |
| colliders | `ColliderDesc.cuboid(hx,hy,hz)`, `.ball(r)`, `.capsule(halfHeight, radius)` (axis = local Y); `.setDensity(0)`; `world.createCollider(desc, body)` |
| mass | `RigidBodyDesc.setAdditionalMassProperties(mass, com, principalInertia, inertiaFrame)`; on a live body `setAdditionalMassProperties(mass, com, inertia, frame, wakeUp)`; `body.mass()` |
| fixed joint | `JointData.fixed(anchor1, frame1, anchor2, frame2)` then `world.createImpulseJoint(data, body1, body2, wakeUp)`; `world.removeImpulseJoint(joint, wakeUp)`; `joint.setContactsEnabled(false)` |
| forces | `body.addForce(f, wakeUp)`, `addForceAtPoint(f, worldPoint, wakeUp)`, `addTorque(t, wakeUp)`; all world-frame; **persistent until `resetForces(wakeUp)` / `resetTorques(wakeUp)`** |
| state | `body.translation()`, `rotation()` (`{x,y,z,w}`), `linvel()`, `angvel()` (world frame), `setTranslation/Rotation/Linvel/Angvel(v, wakeUp)` |
| teardown | `world.free()` |

## Measured facts

- Rapier-wasm is **f32**: positions/velocities come back rounded to float32 (e.g. `9.999990463256836`). The local-physics-frame design (units-and-frames.md) is what keeps magnitudes float32-safe.
- With a collider of density 0 and `setAdditionalMassProperties`, `body.mass()` reads `0` until the first step and `2` afterwards; behaviour is correct.
- **Integrator error.** Constant force `F = 10 N`, `m = 2 kg`, zero gravity, force re-applied then reset around every `step()` (the interface contract). Position after `t = 2 s`:

  | dt | Rapier x(2 s) | ½at² = 10 | error | v(2 s) |
  |---|---|---|---|---|
  | 0.02 | 10.025013 | 10 | +2.50e-2 | 9.99999 |
  | 0.01 | 10.012460 | 10 | +1.25e-2 | 9.99992 |
  | 0.005 | 10.006189 | 10 | +6.2e-3 | 10.00004 |

  First steps at dt = 0.02: x = 0.00125, 0.00450, 0.00975 vs exact 0.001, 0.004, 0.009, i.e. error = a·dt·t/8 exactly, growing linearly in t (a first-order integrator). Velocity is exact to f32. Consequence: "position matches ½at² within 1e-3 at dt = 0.02" is not achievable with Rapier's integrator (see plan 004 Log).
- Coasting with `linvel = 10` for 100 steps at dt = 0.02 gives `x = 19.99998` (exact to f32).

## Compound bodies and mass properties (plan 011)

Checked 2026-10-16 (0.21.0 `.d.ts` plus the pages below).

Sources:
- https://rapier.rs/docs/user_guides/javascript/colliders — compound bodies: create one body, give each `ColliderDesc` `setTranslation`/`setRotation` (relative to the body when attached), `world.createCollider(desc, body)` once per shape; `Collider.setTranslationWrtParent` for later changes; collider density defaults to 1 and contributes mass, so we set density 0.
- https://rapier.rs/docs/user_guides/javascript/rigid_bodies — `setAdditionalMassProperties(mass, centerOfMass, principalAngularInertia, principalInertiaFrame)` (3D); "won't prevent the colliders' contributions" (hence density 0); `linvel` is the velocity of the centre of mass.

Measured:
- The centre of mass passed to `setAdditionalMassProperties` is a *local* offset from the body translation (`localCom()` / `worldCom()` exist in the `.d.ts`); `translation()` stays the body origin; `linvel()` is the COM velocity; free spin turns about the COM (test `compound.test.ts`).
- Mass properties set on a live body take effect at the next `step`: a force applied at a point before that step uses the old centre of mass (first-step torque of 30 N·m for a 1 m error in the test). `body.recomputeMassPropertiesFromColliders()` applies the additional mass properties immediately; the adapter calls it after every `setMass`.
- Benchmark (Bun 1.4.2, 16 solver iterations, 500 steps, `packages/physics/bench/grouping.ts`): per-part bodies + fixed joints 150 / 295 / 573 µs per step for 20 / 50 / 100 parts, flex 0.004 / 0.14 / 1.8 m under 5 kN lateral + 20 kN axial; one compound body 20-30 µs, no flex. See ADR 0018.

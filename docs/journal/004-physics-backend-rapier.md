# 004 — Physics backend + Rapier adapter

**Plan:** plans/004-physics-backend-rapier.md · **Session(s):** physics session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

No scaffolding. `packages/physics/package.json` already listed `@dimforge/rapier3d-compat: "catalog:"` (from plan 001); `bun install` linked it (0.21.0, no lockfile change). Rapier docs and `.d.ts` checked first → `research/rapier.md`. The draft was refined to `ready` then `in-progress` as its own step (plan Log).

| File | Contents |
|---|---|
| `packages/physics/src/rapier-backend.ts` | `createRapierBackend(options?)` → `Promise<PhysicsBackend>` |
| `packages/physics/src/mock-backend.ts` | `createMockBackend()` → `PhysicsBackend` (no Rapier, no collisions, joints recorded not enforced) |
| `packages/physics/src/inertia.ts` | `deriveInertia(shape, mass)` (box, sphere, capsule closed forms) and body-param validation |
| `packages/physics/test/rapier-backend.test.ts`, `test/helpers.ts` | 3 plan tests + 8 extras + 2 mock tests (13 total) |
| `docs/plans/011-physics-rigid-grouping.md` | follow-up draft (rigid grouping) |

Design: factory functions returning plain objects (no classes). Rapier world gravity is zero. Every body is a dynamic/kinematic-velocity/fixed body with one density-0 collider; mass and inertia come only from `setAdditionalMassProperties(mass, 0, inertia, identity)` so they are exactly what was requested (inertia derived from the shape when omitted). Forces use `addForce`/`addForceAtPoint`/`addTorque`; touched bodies are tracked and `resetForces`/`resetTorques` after every `step` (one-step lifetime). Joints: `JointData.fixed` + `createImpulseJoint`, contacts between joined bodies disabled. Bodies never sleep (`setCanSleep(false)`). `MockPhysicsBackend` lives in `physics` (not `core`): core stays interface-only (ADR 0011 spirit) and the mock needs `deriveInertia`.

## What surprised me

- **Acceptance criterion 1 was unachievable as written.** Rapier's integrator is first order: with a constant force x(t) deviates from `½at²` by exactly `a·dt·t/8` (2.5e-2 at dt = 0.02, t = 2). I stopped, reported, and the human approved comparing against `½at² + a·dt·t/8` within 1e-3 plus `v = at` within 1e-3 (plan Log; same treatment as plan 002).
- Rapier is f32: results are float32-rounded; `body.mass()` reads 0 until the first step when mass comes from additional mass properties.
- **Fixed-joint chains are soft.** Plan test 2 (2 bodies, modest off-centre force, ~1 rad/s) holds the relative transform to < 1e-4. At ~11 rad/s the same pair drifted 1.3e-3 with the default 4 solver iterations (8: 3.8e-4, 16: 1.1e-4, 32: 2.8e-5), hence the `solverIterations` option. A long chain under heavy load flexes a lot: with 20 / 100 capsules (100 kg each, 5 kN lateral + 20 kN axial on the root, gravity forces on all) end-to-end drift after 10 s was 1.1 m / 54 m at default iterations, at 0.08 / 0.22 ms per step. That load is extreme, but it is the case for plan 011 (rigid grouping) and for `solverIterations` tuning in plan 007.
- Rapier's body and joint removal: `removeRigidBody` drops attached joints itself; the adapter mirrors that in its handle tables.
- Unjoined bodies still collide (colliders exist for every body); only joined pairs have contacts disabled. Debris after a decoupler separation that overlaps its former parent will be pushed apart.

## Decisions made (link ADRs)

None needing an ADR (ADR 0004 covers the adapter). Details: mock in `physics`; no sleeping; zero Rapier gravity.

## Open questions / follow-ups

- Plan 011 (draft): rigid grouping / compound bodies, to be benchmarked once plan 007 exists.
- Plan 007 should choose `solverIterations` and decide whether to rely on joint chains for tall vessels (see above).
- Mock backend does not enforce joints and ignores body rotation for torque (documented in its header).

## Verification output

```
$ bun test packages/physics
 13 pass
 0 fail
Ran 13 tests across 1 file.
```
(Full-suite and criteria output: see plan Log and final commit.)

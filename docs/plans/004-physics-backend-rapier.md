---
id: 004
title: Physics backend + Rapier adapter
status: in-progress
owner: "physics session (Claude, 2026-10-16)"
depends: [003]
phase: 0
created: 2026-10-16
updated: 2026-10-16
---

# 004 — Physics backend + Rapier adapter

## Goal

`@orbital/physics` implements `PhysicsBackend` with `@dimforge/rapier3d-compat`, usable headlessly in Bun and in the browser, with tests proving gravity, joints and force application behave as expected.

## Context

- Read: `docs/architecture/boundaries.md` (physics rules), `units-and-frames.md` (local physics frame), `simulation.md` (vessel → bodies).
- ADRs: 0004.
- Before coding: read the current Rapier JS user guide online (initialisation of the compat build is async: `await RAPIER.init()`), confirm the API for fixed joints, impulse/force application, and `World.step`. Record in `docs/research/stack-versions.md`.

## Scope

**In:** adapter implementing the interface; async `createRapierBackend(options)`; gravity is NOT set in Rapier (sim applies it as forces so it can vary with altitude); deterministic stepping; a `MockPhysicsBackend` (kinematic, no collisions) in `core` or `physics` for fast tests elsewhere.
**Out:** collisions with terrain (Phase 3), rigid grouping optimisation (track as follow-up plan), physics warp.

## Design notes

- Rapier's world gravity set to zero; all gravity via `applyForce`.
- Use `RigidBodyDesc.dynamic()` per part; colliders from a box or capsule described in `BodyDesc.shape`.
- Fixed joints via `JointData.fixed`.
- Expose `step(dt)` with Rapier's `integrationParameters.dt = dt` set per call (sim uses a constant anyway).
- Bundle note: the compat build embeds WASM as base64; no Vite config needed. Document in research.

## Steps

1. Verify Rapier docs online; record.
2. `src/rapier-backend.ts` (`createRapierBackend(options?): Promise<PhysicsBackend>`: `await RAPIER.init()`, `new RAPIER.World({x:0,y:0,z:0})`, `world.timestep = dt` before each `world.step()`; bodies via `RigidBodyDesc.dynamic()/fixed()/kinematicVelocityBased()` + `createCollider(ColliderDesc.cuboid/ball/capsule, body)` with `setDensity(0)` and mass via `setAdditionalMassProperties(mass, {0,0,0}, inertia, identity)`, inertia derived analytically from the shape when omitted; `JointData.fixed(anchorA, rotA, anchorB, rotB)` + `world.createImpulseJoint(data, bodyA, bodyB, true)` with `setContactsEnabled(false)`; `addForce`/`addForceAtPoint`/`addTorque` tracked per body and `resetForces`/`resetTorques` after every `step`; `dispose()` calls `world.free()`), `src/mock-backend.ts` (`createMockBackend()`: kinematic, no collisions, same one-step force lifetime), `src/index.ts`. Rapier details: `docs/research/rapier.md`.
3. Tests (`test/*.test.ts`): free fall under an applied constant force matches `½at²` within 1e-3 over 2 s at dt = 0.02; two bodies joined by a fixed joint keep their relative transform within 1e-4 after 200 steps under a force on one of them; same inputs twice → identical transforms (determinism). Plus: forces last one step, torque/angular velocity axes, remove body/joint, mock backend contract.
4. Journal.

## Acceptance criteria

- [ ] `bun test packages/physics` passes with the three tests above.
- [ ] Only `packages/physics/package.json` lists `@dimforge/rapier3d-compat`.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, `docs/research/stack-versions.md`.
- [ ] `docs/architecture/simulation.md` if the vessel→bodies mapping changed.

## Log

- 2026-10-16 — Created as draft; refine Steps 2–3 with the actual Rapier API before setting `ready`.
- 2026-10-16 — Refined draft → ready at the human's request (session: physics session); Steps 2–3 updated to Rapier 0.21.0 API.
- 2026-10-16 — Started (in-progress, physics session).
- 2026-10-16 — **STOPPED before implementing: acceptance criterion 1 / Step 3 test 1 is unachievable as written.** Measured with Rapier 0.21.0 (see `research/rapier.md`): constant 10 N on 2 kg, dt = 0.02, 100 steps, forces re-applied and reset each step: x(2 s) = 10.025013 vs ½at² = 10 (error 2.5e-2, 25x the 1e-3 tolerance; 2.5e-3 relative). Cause: Rapier's integrator has an error of a·dt·t/8 (first-order in dt); velocity is exact (9.99999). Not an adapter bug and not f32 rounding. Criterion left unchanged. Options for the human: (a) relax the tolerance to 3e-2 absolute at dt = 0.02 (documents the integrator error); (b) compare against Rapier's own discrete solution `½at² + a·dt·t/8` within 1e-3 and also assert velocity `at` within 1e-3; (c) keep 1e-3 against `½at²` but require dt <= 0.0008 (about 25 substeps per 0.02 s sim step, not viable). Recommendation: (b). The other two tests and the adapter are unblocked once the criterion is decided; no code was written.

---
id: 004
title: Physics backend + Rapier adapter
status: draft
owner: ""
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
2. `src/rapier-backend.ts`, `src/mock-backend.ts`, `src/index.ts`.
3. Tests: free fall under an applied constant force matches `½at²` within 1e-3 over 2 s at dt = 0.02; two bodies joined by a fixed joint keep their relative transform within 1e-4 after 200 steps under a force on one of them; same inputs twice → identical transforms (determinism).
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

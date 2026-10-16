---
id: 011
title: Physics rigid grouping (compound bodies)
status: in-progress
owner: "grouping session (Claude, 2026-10-16)"
depends: [004, 007]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 011 — Physics rigid grouping (compound bodies)

## Goal

Contiguous vessel parts with no decoupler between them are merged into one compound rigid body (several colliders, one body), so a 100-part rocket costs a handful of bodies and joints instead of 100 bodies and ~99 fixed joints. Splitting happens on stage or break. The `PhysicsBackend` API stays source-compatible (internal change, per `architecture/simulation.md`).

## Context

- Read: `docs/architecture/simulation.md` (vessel assembly → physics, rigid grouping), `docs/journal/004-physics-backend-rapier.md` (measured joint drift and per-step cost).
- ADRs: 0004.

## Scope

**In:** measure first (joint count vs. step time and joint drift with `createRapierBackend` for 20/50/100 parts); decide whether the backend gains compound-body support (e.g. a `BodyDesc.shapes` list) or `sim` merges parts into one `BodyDesc`; implement and test split on stage.
**Out:** terrain collisions, physics warp.

## Design notes

Settled by [ADR 0018](../decisions/0018-rigid-grouping-compound-bodies.md); the benchmark that justified it is in `docs/research/rapier.md` and the ADR context.

- Group = the whole vessel: one body, one collider per part, rebuilt on every split. `BodyShape` gains a `compound` variant, `MassPlacement` (`centerOfMass`, `inertiaFrame`) goes into `BodyDesc` and `setMass`; no new backend method.
- Body origin = root part origin; `getTransform` is the origin, velocities are the centre of mass's.
- Mass, COM and full inertia tensor (Jacobi-diagonalised) recomputed whenever a part mass changes.
- Split: each part moves as `v_com + ω × r`; each side's body gets its mass-weighted velocity plus the decoupler impulse and the same ω.
- Public `createSim` API, `Snapshot`, `Command`, `VesselDesign` and the SDK are unchanged; ADR 0017's pad hold stays (plan 012 owns ground contact).

## Steps

1. Benchmark the per-part approach (20/50/100 parts) and verify Rapier compound/mass APIs online; record in `docs/research/rapier.md`. (done in refinement)
2. ADR 0018; refine this plan to `ready`. (done in refinement)
3. Core + physics: `compound` shape, `MassPlacement`, adapter and mock support, tests.
4. Sim: rewrite `FlightFrame` and `frames.ts`/`vessel.ts`/`hooks.ts`/`snapshot.ts` around one body per vessel; mass properties with inertia tensor; split rebuild; pad hold and ground on the rigid body.
5. Tests (below), docs, journal, STATUS.

## Acceptance criteria

- [ ] `bun test packages/physics`: compound tests pass (force at COM does not spin, spin about COM, `setMass` moves COM, every primitive collides, validation errors, determinism, mock accepts compound).
- [ ] `bun test packages/sim` passes unchanged tests, in particular `scenario-orbit.test.ts` (plan 007 orbit: periapsis > 70 km, e < 0.1, within 1 200 s, wall < 30 s).
- [ ] `packages/sim/test/grouping.test.ts` "bodies": a 100-part stack in flight uses exactly 1 backend body and 0 joints (counted with a recording backend wrapper); a two-stage vessel uses 1, and 2 after the stage that splits it.
- [ ] `grouping.test.ts` "split continuity": a spinning, translating two-stage vessel is split at the decoupler with zero impulse: total linear momentum and total angular momentum about the pre-split COM (from snapshots and part masses) are conserved within 1e-3 relative, each half's COM is within 0.05 m of its pre-split COM propagated one step, and each half's mass equals the sum of its part masses.
- [ ] `grouping.test.ts` "inertia": for an asymmetric two-part vessel the pushed inertia equals the analytic tensor (parallel axis) within 1e-6 relative, and the COM moves towards the heavier part as propellant is withdrawn (checked via the recorded `setMass` calls).
- [ ] `grouping.test.ts` "determinism": two runs of the same scripted ascent plus a split give byte-identical `JSON.stringify(snapshot())` at t = 100 s (the existing `determinism.test.ts` still passes as well).
- [ ] `grouping.test.ts` "rigid": a 100-part stack under thrust and wheel torque keeps every part within 1e-4 m of its rigid pose (length from root vs design) for 10 s.
- [ ] Performance: `bun packages/sim/bench/stack.ts 20 50 100` reports at most 25 % of the baseline step time at 100 parts (baseline 703 µs, so <= 176 µs), and `bun packages/physics/bench/grouping.ts compound` < 60 µs at 100 parts (baseline per-part 573 µs); numbers recorded in the journal.
- [ ] `bun test` (whole repo), `bun run typecheck`, `bun run build`, `bun run docs:check` pass (apps/web is another session's in-flight area: failures there are reported separately); `bunx prettier --check packages/core packages/physics packages/sim` passes.
- [ ] `grep -rn "rapier" packages/sim/src packages/core/src -i` prints nothing (only `physics` imports Rapier).

## Docs checklist

- [ ] `docs/STATUS.md` (row, journal, known issues: joint softness note), journal 011 with before/after benchmark, `docs/architecture/simulation.md` (assembly and physics, staging, PhysicsBackend), `docs/research/rapier.md`, ADR 0018 and its index row.

## Log

- 2026-10-16 — Created as draft from plan 004 (rigid grouping was out of scope there).
- 2026-10-16 — Refined draft → ready at the human's request (session: grouping session). Benchmark and Rapier API check done (ADR 0018, research/rapier.md).
- 2026-10-16 — Started: status in-progress (grouping session).

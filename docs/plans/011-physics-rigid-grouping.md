---
id: 011
title: Physics rigid grouping (compound bodies)
status: done
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

- [x] `bun test packages/physics`: compound tests pass (force at COM does not spin, spin about COM, `setMass` moves COM, every primitive collides, validation errors, determinism, mock accepts compound). — 20 tests in packages/physics (7 new in `compound.test.ts`)
- [x] `bun test packages/sim` passes unchanged tests, in particular `scenario-orbit.test.ts` (plan 007 orbit: periapsis > 70 km, e < 0.1, within 1 200 s, wall < 30 s). — `bun test packages/sim`: 37 pass incl. scenario-orbit (periapsis 76.1 km, e 0.026, 213.6 s sim, 0.3 s wall)
- [x] `packages/sim/test/grouping.test.ts` "bodies": a 100-part stack in flight uses exactly 1 backend body and 0 joints (counted with a recording backend wrapper); a two-stage vessel uses 1, and 2 after the stage that splits it. — `grouping.test.ts` bodies (2 tests)
- [x] `grouping.test.ts` "split continuity": a spinning, translating two-stage vessel is split at the decoupler with zero impulse: total linear momentum and total angular momentum about the pre-split COM (from snapshots and part masses) are conserved within 1e-3 relative, each half's COM is within 0.05 m of its pre-split COM propagated one step, and each half's mass equals the sum of its part masses. — `grouping.test.ts` split continuity (fails when the angular velocity is zeroed at the split: mutation checked)
- [x] `grouping.test.ts` "inertia": for an asymmetric two-part vessel the pushed inertia equals the analytic tensor (parallel axis) within 1e-6 relative, and the COM moves towards the heavier part as propellant is withdrawn (checked via the recorded `setMass` calls). — `grouping.test.ts` inertia (off-axis block tensor 1e-6, COM follows propellant, Jacobi reconstruction)
- [x] `grouping.test.ts` "determinism": two runs of the same scripted ascent plus a split give byte-identical `JSON.stringify(snapshot())` at t = 100 s (the existing `determinism.test.ts` still passes as well). — `grouping.test.ts` determinism (100-part tower, mid-stack split)
- [x] `grouping.test.ts` "rigid": a 100-part stack under thrust and wheel torque keeps every part within 1e-4 m of its rigid pose (length from root vs design) for 10 s. — `grouping.test.ts` rigidity: worst deviation < 1e-4 m
- [x] Performance: `bun packages/sim/bench/stack.ts 20 50 100` reports at most 25 % of the baseline step time at 100 parts (baseline 735 µs measured with the warm-up now in the bench, so <= 184 µs), and `bun packages/physics/bench/grouping.ts compound` < 60 µs at 100 parts (baseline per-part 573 µs); numbers recorded in the journal. — sim 140 µs vs 735 µs baseline (19 %); backend compound 25 µs vs 573-606 µs
- [x] `bun test` (whole repo), `bun run typecheck`, `bun run build`, `bun run docs:check` pass (apps/web is another session's in-flight area: failures there are reported separately); `bunx prettier --check packages/core packages/physics packages/sim` passes. — `bun test` 272 pass; typecheck 8/8 ok (web check 0 errors); `bun run build` ok; prettier clean; docs:check below
- [x] `grep -rn "@dimforge" packages/sim/src packages/core/src` prints nothing (only `physics` imports Rapier). — grep prints nothing (outside comments)

## Docs checklist

- [x] `docs/STATUS.md` (row, journal, known issues: joint softness note), journal 011 with before/after benchmark, `docs/architecture/simulation.md` (assembly and physics, staging, PhysicsBackend), `docs/research/rapier.md`, ADR 0018 and its index row.

## Log

- 2026-10-16 — Created as draft from plan 004 (rigid grouping was out of scope there).
- 2026-10-16 — Refined draft → ready at the human's request (session: grouping session). Benchmark and Rapier API check done (ADR 0018, research/rapier.md).
- 2026-10-16 — Started: status in-progress (grouping session).
- 2026-10-16 — Notes: (1) benchmark baseline re-measured with a 100-step warm-up (sim 180/385/735 µs for 20/50/100 parts; the 703 µs in the first draft of the criterion had no warm-up), criterion threshold adjusted to 184 µs, same 25 % ratio; grep criterion reworded to `@dimforge` (a comment mentions "Rapier's"). (2) `scenario-orbit` needed a better circularisation burn-time estimate in the test helper (rocket equation instead of dv·m/F): the crude estimate started the burn 6 s early, and the rigid vessel's slightly different trajectory pushed e from 0.04 to 0.13; criteria unchanged, now e 0.026. (3) `sim.test.ts` "physics body masses" spy now sees the vessel mass instead of the tank mass (one body). (4) Detach requests raised by `update` hooks are applied after the backend step instead of before it (rebuilding the body earlier would drop that step's queued forces).
- 2026-10-16 — Decision: the pad hold (ADR 0017) stays. Experiment: with the hold disabled all 37 sim tests still pass (the sticky ground clamp now holds the rigid stack), so plan 012 can remove it when it replaces ground contact; not removed here because ground contact is outside this plan.
- 2026-10-16 — Done. All acceptance criteria verified (journal 011).

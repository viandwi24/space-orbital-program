---
id: 080
title: "Trajectory provider interface: patched conics behind one API, no behaviour change"
status: in-progress
owner: "Agent 3"
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 080 — Trajectory provider interface: patched conics behind one API, no behaviour change

## Goal

Every consumer of orbit prediction (sim rails and SOI crossings, maneuver nodes, map path, rendezvous aids, trip planner, script API) calls one `TrajectoryProvider`; the patched-conics provider wraps today's functions; the world's `gravityModel` selects it and `n-body` is refused with "not available yet". No number changes.

## Context

- ADRs: 0095, 0051, 0056, 0084, 0110 (`gravityModel` in the world info), 0173 (written in step 2: the interface and how consumers reach it).
- Read: ADR 0095, `packages/kepler/src` (`patched.ts`, `maneuver.ts`, `rendezvous.ts`, `soi.ts`, `body-state.ts`, `propagate.ts`, `approach.ts`), `packages/sim/src/soi.ts` (`findCrossing`), `maneuver.ts` (`predictWithManeuvers`, `patchedBodies`), `orbit.ts` and `bodies.ts` (rails `propagate`), `target.ts` (`closestApproach`), `apps/web/src/lib/map-path.ts`, `rendezvous-aids.ts` (and `maneuver-controller.ts`, `script-api.ts`, which reach prediction through `map-path.ts`), `worldInfoSchema` in `packages/core/src/schemas.ts`.

## Scope

**In:**
- `TrajectoryProvider` type in kepler (re-exported by core and the SDK), bound to one set of `PatchedBody`: `capabilities` (`{ model: 'patched', maneuvers, soiTransitions }`), `stateAt`, `bodyState`, `propagate`, `predict`, `predictWithManeuvers`, `track`, `trackOfSegments`, `bodyTrack`, `conicTrack`, `closestApproach` (patched), `closestApproachOnTrack`, `conicClosestApproach` (two conics), `crossing`.
- `createPatchedProvider(bodies)` wrapping the existing functions unchanged, and `trajectoryFor(bodies)` that caches one provider per body list (`WeakMap`), so callers that hold a body list keep their signatures. `createTrajectoryProvider(model, bodies)` picks by `gravityModel` and throws for `n-body`.
- Consumers moved: sim `soi.ts` (crossing), `maneuver.ts` (node prediction), `orbit.ts` and `bodies.ts` (rails), `target.ts` (closest approach) through `SimCore.trajectory`, created at `createSim` from the world's `gravityModel`; web `map-path.ts` and `rendezvous-aids.ts` through `trajectoryFor(bodies)` (their callers `maneuver-controller.ts` and `script-api.ts` are unchanged).
- Validation: `createSim` with a world whose `gravityModel` is `n-body` throws a `SaveError` with code `incompatible` and "n-body worlds are not available yet" (a save is already refused by `readSimSave`).

**Out:** any n-body code (draft 125); bodies on non-conic paths (123).

## Touches

- **Size:** M
- **Edits:** `packages/kepler` (`trajectory.ts` new, `index.ts`, tests), `packages/core` (`index.ts` re-export, `version.ts`), `packages/sdk` (type exports), `packages/sim` (`core.ts`, `sim.ts`, `soi.ts`, `maneuver.ts`, `orbit.ts`, `bodies.ts`, `target.ts`, tests), `apps/web/src/lib/map-path.ts`, `apps/web/src/lib/rendezvous-aids.ts` (and golden tests next to them), `docs/architecture/simulation.md`
- **Shared contracts:** **core types (`TrajectoryProvider`, `GravityModel`)**; no save or protocol change beyond 077's field

## Design notes

Golden tests first: record the outputs of the existing prediction tests and assert identical results after the move.

## Steps

1. Golden outputs before any move: snapshot files of map path, node prediction, rendezvous aids (web vitest), SOI crossing times and node prediction (sim), recorded on `main` code and committed.
2. ADR 0173; interface and patched provider; kepler test that every provider method equals the wrapped function exactly.
3. Move consumers one by one; the goldens and all existing tests stay green after each.
4. Validation and refusal; timing comparison (indicative here, M5 at merge).

## Acceptance criteria

- [ ] All existing `packages/kepler`, `packages/sim` (`soi.test.ts`, `maneuver` tests) and `apps/web` (`map-path`, `rendezvous-aids`, `maneuver-controller`) tests pass with no test file edited; the golden snapshot tests (recorded before the move, step 1) pass unchanged after it.
- [ ] `bun test packages/kepler/test/trajectory.test.ts`: each provider method returns exactly (`toEqual`) what the wrapped function returns; `createTrajectoryProvider('n-body', …)` throws "n-body worlds are not available yet".
- [ ] `packages/sim` test: `createSim` with `gravityModel: "n-body"` throws a `SaveError` with code `incompatible` whose message says n-body is not available yet.
- [ ] Timing ¹: map path and node prediction within 2 % of before (journal table; M5 by Agent 1, indicative here).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/080-trajectory-provider-interface.md` written.
- [ ] `docs/architecture/simulation.md` (prediction section).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0095).
- 2026-10-17 — Refined and claimed by Agent 3. The web functions keep their `bodies` parameters and reach the provider through a cached `trajectoryFor(bodies)`, so callers do not change. The sim holds one provider on `SimCore`. Goldens are recorded before any move. The interface goes in ADR 0173.

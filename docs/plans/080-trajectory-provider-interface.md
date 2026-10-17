---
id: 080
title: "Trajectory provider interface: patched conics behind one API, no behaviour change"
status: draft
owner: ""
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 080 — Trajectory provider interface: patched conics behind one API, no behaviour change

## Goal

Every consumer of orbit prediction (sim rails and SOI crossings, maneuver nodes, map path, rendezvous aids, trip planner, script API) calls one `TrajectoryProvider`; the patched-conics provider wraps today's functions; the world's `gravityModel` selects it and `n-body` is refused with "not available yet". No number changes.

## Context

- ADRs: 0095
- Read: ADR 0095, 0051, 0056, 0084, `packages/kepler/src` (`patched.ts`, `maneuver.ts`, `rendezvous.ts`, `soi.ts`), `packages/sim/src/soi.ts`, `maneuver.ts`, `apps/web/src/lib/map-path.ts`, `rendezvous-aids.ts`, `maneuver-controller.ts`, `script-api.ts`.

## Scope

**In:**
- `TrajectoryProvider` type in kepler (re-exported by core): `stateAt`, `predict`, `crossing`, `closestApproach`, `capabilities`.
- `createPatchedProvider(bodies)` wrapping the existing functions.
- Consumers moved to the provider; the sim chooses it from the world's `gravityModel` at `createSim`.
- Validation: a world or save with `n-body` is refused (`SaveError` code `incompatible`, reason text).

**Out:** any n-body code (draft 125); bodies on non-conic paths (123).

## Touches

- **Size:** M
- **Edits:** `packages/kepler`, `packages/core`, `packages/sim`, `apps/web/src/lib/map-path.ts`, `apps/web/src/lib/rendezvous-aids.ts`, `apps/web/src/lib/maneuver-controller.ts`, `apps/web/src/lib/script-api.ts`
- **Shared contracts:** **core types (`TrajectoryProvider`, `GravityModel`)**; no save or protocol change beyond 077's field

## Design notes

Golden tests first: record the outputs of the existing prediction tests and assert identical results after the move.

## Steps

1. Golden outputs for map path, node prediction, rendezvous aids, SOI crossing times.
2. Interface and patched provider.
3. Move consumers one by one.
4. Validation and refusal message; timing comparison.

## Acceptance criteria

- [ ] All existing `packages/kepler`, `packages/sim` (`soi.test.ts`, `maneuver` tests) and `apps/web` (`map-path`, `rendezvous-aids`, `maneuver-controller`) tests pass unchanged; new golden tests compare provider output with the pre-move numbers exactly.
- [ ] `packages/sim` test: `createSim` with `gravityModel: "n-body"` throws a `SaveError` whose message says n-body is not available yet.
- [ ] Timing: map path and node prediction within 2 % of before (journal table, M5).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/080-trajectory-provider-interface.md` written.
- [ ] `docs/architecture/simulation.md` (prediction section).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0095).

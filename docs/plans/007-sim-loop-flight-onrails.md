---
id: 007
title: "Sim loop: flight + on-rails"
status: draft
owner: ""
depends: [002, 004, 006]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 007 — Sim loop: flight + on-rails

## Goal

`@orbital/sim` runs the fixed-timestep loop over a world booted with stock: vessel assembly from a design → rigid bodies + joints, gravity, resources flowing to engines, staging, atmosphere drag, flight ↔ on-rails transitions, time warp, snapshots and commands. **Phase 0 exit test:** a scripted two-stage stock vessel reaches a stable orbit headlessly in `bun test`.

## Context

- Read: `docs/architecture/simulation.md` (implement it; then update it), `units-and-frames.md`.
- ADRs: 0003, 0004, 0007.
- Journal entries of 002, 004, 005, 006.

## Scope

**In:** everything listed in the goal; a scripted ascent profile helper for tests; determinism test.
**Out:** rigid grouping optimisation (new plan if performance requires), SOI transitions (single body), maneuver nodes, Worker hosting (009).

## Design notes

- `createSim({ backendFactory, plugins, seed })` → `{ step(dt), dispatch(cmd), snapshot(), world }`.
- Vessel design format (JSON): `{ root: PartInstance }` with `PartInstance = { part: id, attachedAt?: nodeName, children: PartInstance[] }` + `stages: PartInstanceId[][]`. Document in `architecture/simulation.md` and keep stable (used by VAB save/load).
- Mode switch rules per `simulation.md`.
- The scripted ascent for the exit test: full throttle, vertical to 10 km, gravity turn to 45° by 40 km, prograde after, stage when a stage is empty, cut at apoapsis ≥ 80 km, coast to apoapsis, circularise. Allowed to be crude; the point is that the pipeline works.

## Steps

1. Vessel assembly (`src/vessel.ts`), mass properties.
2. Gravity + aero systems, resource flow system, staging.
3. Mode transitions, on-rails propagation via `kepler`, time warp gate.
4. Protocol: `dispatch`, `snapshot`.
5. Tests, including the orbit scenario and determinism.
6. Update `simulation.md`; journal; ADRs.

## Acceptance criteria

- [ ] `bun test packages/sim` passes including `scenario-orbit.test.ts`: vessel ends with periapsis > 70 km, eccentricity < 0.1, within 1 200 s of simulated time; runtime of the test < 30 s in Bun.
- [ ] `determinism.test.ts`: two runs with identical command scripts produce byte-identical JSON snapshots at t = 100 s.
- [ ] `warp.test.ts`: warp > 1 refused while any vessel is in flight mode; accepted when on rails; on-rails position after 10 000 s with warp matches `kepler.propagate` within 1e-6 relative.
- [ ] `bun run typecheck`, `bun run docs:check` pass; `sim` has no DOM/Bun API usage (grep as in plan 003).

## Docs checklist

- [ ] `docs/STATUS.md` (Phase 0 → complete if all Phase 0 plans done), journal, `architecture/simulation.md`, ADR(s).

## Log

- 2026-10-16 — Created as draft.

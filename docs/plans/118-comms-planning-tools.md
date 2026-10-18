---
id: 118
title: "Comms planning tools: contact timeline, coverage map, constellation planner"
status: in-progress
owner: "Agent 2"
depends: [117]
phase: 7
created: 2026-10-17
updated: 2026-10-18
---

# 118 — Comms planning tools: contact timeline, coverage map, constellation planner

## Goal

Players plan networks: a contact timeline per vessel and station, a coverage map over a body, and a constellation planner that proposes resonant deployment orbits; all computed in a separate Worker from snapshots, never in the sim step.

## Context

- ADRs: 0101, [0163](../decisions/0163-comms-planning-worker-timeline-coverage-constellation.md) (this plan)
- Read: ADR 0101 tier 3 and point 2 (planning off the sim Worker), plan 080 (trajectory provider).

## Scope

**In:**
- Planning Worker with the provider and the link model functions.
- Contact timeline (next N hours of up/down per pair).
- Coverage heat map texture per body.
- Constellation planner: N satellites, target orbit, resonant deploy orbit and burn plan.
- Mission Center panels for the three.

**Out:** automatic deployment by script (a later stock script).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/lib`, `apps/web/src/routes/mission-center`, `packages/kepler`, `mods/stock`
- **Shared contracts:** none

## Design notes

The planning Worker reuses pure functions; results are cached by snapshot time.

## Steps

1. Worker and protocol (ADR 0163 point 1): `lib/comms-planning/planning.worker.ts`, a client with a cache, the boundary test; the `ready` catalog gains `antennas`.
2. Timeline (point 2): `contactTimeline` over the sim's link rule on conics, sampled at 10 s and bisected to 0.01 s; the vessel's range from its parts (point 3).
3. Coverage (point 4): `coverageGrid` per body, 72 x 36, a reference receiver.
4. Planner (point 5): `resonantDeployment` in `packages/kepler`.
5. The Mission Center panel (point 6), guide and journal.

## Acceptance criteria

- [x] vitest: the timeline for a stated orbit and station matches the sim's link events over 24 h within 1 s (`comms-planning.test.ts`: a probe at 2000 km, 20° inclined, and the Space Center at warp 1e5; 4 events, equal to the sim's).
- [x] `packages/kepler` test: the planner's resonant orbit for 3 satellites has a period ratio of 4/3 (or the stated ratio) and drops them 120 degrees apart (`constellation.test.ts` flies the plan: 120° within 1e-6 rad, radii within 1e-6).
- [x] Measurement: planning work never runs in the sim Worker (test asserts the Worker boundary: no `comms-planning` module in `sim.worker.ts`'s import graph, no `@orbital/sim` in the planning Worker's): `boundary.test.ts`.
- [x] vitest: the coverage grid of a single relay over a body is 1 under the relay and 0 on the far side (restated from a station: a ground receiver sees a ground station only within its horizon, about 11 km; ADR 0163 point 4).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row only; the rest is the Lead's).
- [x] `docs/journal/118-comms-planning-tools.md` written.

- [x] New ADRs for decisions made here (0163); nothing looked up.

## Log

- 2026-10-18 — Agent 2: built. The planning Worker with a cached client, the timeline, the coverage grid, `resonantDeployment`, the Mission Center's Planning panel (Timeline, Coverage, Constellation), and `antennas` in the `ready` catalog. The coverage criterion is restated with a relay (see the criterion). e2e: `mission-center.e2e.ts` drives the three tools.
- 2026-10-18 — Agent 2: refined (Steps, ADR 0163). Contract request: `network.vessels[].range` in the snapshot would replace the page-side range heuristic (ADR 0163 point 3).
- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).
- 2026-10-18 — Merged by Agent 1 (ADR 0126): CI refs/ci/pass/8490159 for the handed-over commit; on the rebased result check:affected passed (13 affected workspaces, bun test, related vitest), the build and the Chromium smoke; the Mission Center e2e passes.

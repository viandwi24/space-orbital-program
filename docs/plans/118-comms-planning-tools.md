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

- [ ] vitest: the timeline for a stated orbit and station matches the sim's link events over 24 h within 1 s.
- [ ] `packages/kepler` test: the planner's resonant orbit for 3 satellites has a period ratio of 4/3 (or the stated ratio) and drops them 120 degrees apart.
- [ ] Measurement: planning work never runs in the sim Worker (test asserts the Worker boundary: no `comms-planning` module in `sim.worker.ts`'s import graph, no `@orbital/sim` in the planning Worker's).
- [ ] vitest: the coverage grid of a single station on a body is 1 under the station and 0 on the far side.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/118-comms-planning-tools.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-18 — Agent 2: refined (Steps, ADR 0163). Contract request: `network.vessels[].range` in the snapshot would replace the page-side range heuristic (ADR 0163 point 3).
- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).

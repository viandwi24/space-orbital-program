---
id: 118
title: "Comms planning tools: contact timeline, coverage map, constellation planner"
status: draft
owner: ""
depends: [117]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 118 — Comms planning tools: contact timeline, coverage map, constellation planner

## Goal

Players plan networks: a contact timeline per vessel and station, a coverage map over a body, and a constellation planner that proposes resonant deployment orbits; all computed in a separate Worker from snapshots, never in the sim step.

## Context

- ADRs: 0101
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

1. Worker and protocol.
2. Timeline.
3. Coverage.
4. Planner.

## Acceptance criteria

- [ ] vitest: the timeline for a stated orbit and station matches the sim's link events over 24 h within 1 s.
- [ ] `packages/kepler` test: the planner's resonant orbit for 3 satellites has a period ratio of 4/3 (or the stated ratio) and drops them 120 degrees apart.
- [ ] Measurement: planning work never runs in the sim Worker (test asserts the Worker boundary).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/118-comms-planning-tools.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).

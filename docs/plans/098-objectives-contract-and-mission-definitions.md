---
id: 098
title: "Objectives: the evaluator behind contracts and missions"
status: draft
owner: ""
depends: [078, 082]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 098 — Objectives: the evaluator behind contracts and missions

## Goal

One deterministic objective evaluator exists: `defineObjective` primitives (reach orbit with bounds, land in a region, return a sample, hold a comms link for a time, deliver a payload, by a date) compose into `defineContract` and `defineMission` data, are evaluated on events and on the world tick, and report progress per objective.

## Context

- ADRs: 0098, 0104
- Read: ADR 0098 point 4, `refs/reverse-engineering-ksp2/06-missions-contracts-achievements.md` (git-ignored).

## Scope

**In:**
- Objective primitive interface: parameters schema, `evaluate(world, event?)` pure, progress value and done/failed.
- Stock primitives for the flight state that exists today (orbit, landed, altitude, SOI, flyby, return home, time limit); placeholders that become active when science, crew and comms land.
- Contract and mission schemas: objectives (all/any/sequence), reward and penalty ledger entries, deadline, prerequisites.
- Active-objective component and its evaluation scheduling.

**Out:** generation of offers (099), the story line (100).

## Touches

- **Size:** S
- **Edits:** `packages/core`, `packages/sdk`, `packages/sim`, `mods/stock`
- **Shared contracts:** **SDK (`defineObjective`, `defineContract`, `defineMission`), save (active objectives)**

## Design notes

Evaluation cost is O(active objectives) per event; primitives subscribe to the events they need.

## Steps

1. Interfaces and schemas.
2. Stock primitives with tests.
3. Evaluation scheduling.
4. Resume test with active objectives.

## Acceptance criteria

- [ ] `packages/sim` test: a "reach orbit with periapsis over 80 km" objective completes in the headless ascent scenario on the step the orbit becomes stable.
- [ ] `packages/sim` test: a sequence (orbit, then return home) does not complete when the return happens first.
- [ ] `packages/sim` resume test with active objectives.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/098-objectives-contract-and-mission-definitions.md` written.
- [ ] `plugin-system.md`, `guides/writing-a-mod.md` (objectives).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098, 0104).

---
id: 130
title: "Part reliability (world rule, off by default)"
status: draft
owner: ""
depends: [078, 095]
phase: 9
created: 2026-10-17
updated: 2026-10-17
---

# 130 — Part reliability (world rule, off by default)

## Goal

With the reliability rule on (off by default, on in an engineer-focused preset), each part model has a reliability that grows with flight experience; failures are drawn from the sim PRNG so replays match; quality grades trade cost and mass for reliability; a test stand building runs static fires; anomaly reports offer fixes; engineers repair.

## Context

- ADRs: 0094, 0100
- Read: ADR 0094 point 3 (rule, default off), ADR 0100 (engineer ability), `refs/reverse-engineering-ksp2/beyond/02-player-roles-and-fantasies.md` (engineer; git-ignored).

## Scope

**In:**
- Reliability per part model per world; experience update after flights.
- Failure modes per module kind (engine shutdown, valve stuck, antenna dead) as data.
- Quality grade in the Hangar.
- Test stand building and static fire.
- Anomaly report and repair by EVA engineer.

**Out:** redundancy optimisation tools.

## Touches

- **Size:** L
- **Edits:** `packages/sim`, `packages/sdk`, `mods/stock`, `apps/web/src/routes/vab`, `apps/web/src/lib/hud`
- **Shared contracts:** **SDK (failure modes), save (reliability state)**

## Design notes

Failure draws use a dedicated PRNG stream so enabling reliability does not change other systems' draws.

## Steps

1. Refine at phase start.

## Acceptance criteria

- [ ] To be made measurable at refinement (rule off: no failure in 10 000 flights; rule on: observed failure rate within statistical bounds of the stated reliability; replay identical).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/130-part-reliability.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0094, 0100).

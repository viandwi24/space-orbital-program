---
id: 130
title: "Part reliability (world rule, off by default)"
status: done
owner: "Agent 2"
depends: [078, 095, 109, 090]
phase: 9
created: 2026-10-17
updated: 2026-10-18
---

# 130 — Part reliability (world rule, off by default)

## Goal

With the reliability rule on (off by default, on in an engineer-focused preset), each part model has a reliability that grows with flight experience; failures are drawn from the sim PRNG so replays match; quality grades trade cost and mass for reliability; a test stand building runs static fires; anomaly reports offer fixes; engineers repair.

## Context

- ADRs: 0094, 0100, [0156](../decisions/0156-part-reliability-failure-modes-experience-grades-test-stand.md) (this plan)
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

1. Core and SDK: `defineFailureMode` and the `failureModes` registry, the reliability state and its schema (`SimSave.reliability?`), the chance formula, grades, the new commands.
2. Sim: the `reliability` stream, draws at stage and at load, failed modules skipped, experience, anomaly reports, `set-grade`, `static-fire`, `fix-anomaly`, `repair`, the grade surcharge, save, resume, snapshot, event.
3. Stock: three failure modes, the test stand building, the `stock.career-engineering` preset.
4. Web: reliability and grade in the Hangar's part info (from the world's newest save), the test stand screen (`/test-stand`: grades, static fire, reports and fixes) linked from the Space Center, failed parts and the `part:failed` toast in the HUD.

## Acceptance criteria

- [x] `packages/sim` test: rule off, 1 000 launches and stagings draw nothing and fail nothing (the reliability stream is never advanced).
- [x] `packages/sim` test: rule on, the observed failure rate of 2 000 static fires of a fixed-experience model is within 4 standard deviations of the stated chance; experience lowers it as ADR 0156 point 3 says.
- [x] `packages/sim` test: the same save and commands give the same failures (replay identical, across a save and resume).
- [x] `packages/sim` test: a failed engine gives no thrust; a stuck decoupler does not separate; an engineer on EVA repairs the engine; `fix-anomaly` halves the mode's chance.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/130-part-reliability.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0094, 0100).
- 2026-10-17 — `depends` gains 109, 090 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): repair is by an EVA engineer (plan 109) and the test stand is a building (plan 090).
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2).
- 2026-10-18 — Refined with ADR 0156: failure modes as data on module ids, a failed module's hooks skipped, experience per trial, grades per part model per world (cost only; mass deferred), the test stand building and static fire, anomaly fixes, EVA repair.
- 2026-10-18 — Contract request: `Snapshot.reliability?` and event `part:failed` (protocol; Touches names SDK and save). Commands are appended to the sim command union (append-only area).
- 2026-10-18 — Built: core, SDK, sim, stock modes, test stand and preset (API 0.1.55); the test stand screen, the Hangar's reliability line and the failure toast. Grades trade cost only (mass deferred, ADR 0156 point 5). Handed over as `ready/130`.
- 2026-10-18 — Merged by Agent 1: rebased on main after 105 and 127 (registry, save, snapshot, sim and docs lists kept side by side; the range:violation event closed); API_VERSION 0.1.57; bun test 1619 pass, web vitest 999 pass, typecheck, build, docs:check, smoke e2e 7 passed; launch and worlds e2e pass (Chromium).

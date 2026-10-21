---
id: 283
title: "Rovers: wheel suspension, rover wheels remodel, rover cab, external seat, scanning arms, drill remodel"
status: draft
owner: ""
depends: [282]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 283 — Rovers: wheel suspension, rover wheels remodel, rover cab, external seat, scanning arms, drill remodel

## Goal

Rovers drive on real suspension with remodelled wheels (tread, rim, suspension arm), a rover cab and an external seat; scanning arms (S/M/L) study surface features; the drill looks like a drill.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0262, 0264
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Spring and damper at the wheel contact in `ModuleWheel` with tweakables and visual travel; wheel, cab, seat, arm and drill generators and parts; surface features seeded from the stone lattice; arm study action.
**Out:** Deployed science stations (284).

## Design notes

Suspension is a force inside the single body (ADR 0262 point 8); arms are deploy animations plus a sim check of reach to a feature.

## Steps

1. Suspension model with tests.
2. Parts and generators.
3. Surface features and arm study.

## Acceptance criteria

- [ ] A rover drives over a 0.3 m step at 5 m/s without leaving the ground for more than 0.5 s (sim test).
- [ ] A scanning arm in reach of a feature yields a science item (sim test).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/283-rover-and-arms.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.

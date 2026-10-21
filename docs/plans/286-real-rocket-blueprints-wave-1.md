---
id: 286
title: "Real-rocket blueprints wave 1: Kronos V + Selene, Semyorka-S + Persatuan, Rajawali 9 + Naga, Hermes-R"
status: draft
owner: ""
depends: [275, 276, 277, 278, 280, 281, 285]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 286 — Real-rocket blueprints wave 1: Kronos V + Selene, Semyorka-S + Persatuan, Rajawali 9 + Naga, Hermes-R

## Goal

Four complete blueprints inspired by Saturn V/Apollo, Soyuz, Falcon 9/Dragon and Mercury-Redstone, each with crew, RCS, power, antenna, life support, chutes and heat shield, labelled, and flown headless to their goal.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0263, 0255
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** The four designs, liveries, labels, checklists, headless flight tests (Kronos V to the moon and back, Semyorka-S to orbit and docking, Rajawali 9 booster landing optional, Hermes-R suborbital).
**Out:** Wave 2 and 3 (287).

## Design notes

Names and part lists from the tracker §9.

## Steps

1. Build each design.
2. Headless flight tests.
3. Labels and checklist.

## Acceptance criteria

- [ ] Each blueprint passes the Hangar launch checks and reaches its goal headless (`bun test`).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/286-real-rocket-blueprints-wave-1.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.

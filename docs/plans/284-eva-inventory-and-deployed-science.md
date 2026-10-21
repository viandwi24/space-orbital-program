---
id: 284
title: "EVA inventory, containers and deployed science stations"
status: draft
owner: ""
depends: [280, 281]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 284 — EVA inventory, containers and deployed science stations

## Goal

Astronauts and containers carry cargo parts; engineers attach and detach them on EVA; deployable science items placed on the ground form a station that, with power and comms, sends science over time.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0264
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** `cargo` on parts, `ModuleInventory`, EVA take/place/attach/detach, station vessel on surface rails via the base system, eight deployable items, save additions.
**Out:** Career contracts for stations (new draft).

## Design notes

Per ADR 0264.

## Steps

1. Inventory data and save.
2. EVA actions and UI.
3. Station rules and items.

## Acceptance criteria

- [ ] A station with control unit, panel, antenna and one experiment yields science per day; without power it yields none (sim test).
- [ ] An engineer attaches a battery from a container to a hull and it holds charge (sim test).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/284-eva-inventory-and-deployed-science.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.

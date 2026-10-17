---
id: 096
title: "Buildings with costs, construction time, upkeep and capacity limits"
status: draft
owner: ""
depends: [091, 095, 094]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 096 — Buildings with costs, construction time, upkeep and capacity limits

## Goal

Placing a building costs funds and takes game time (built on the world tick), each building has levels whose upgrades raise capacity and scale only (part count, launch mass, pad size, crew capacity, contract slots, network power, prediction quality), upkeep is charged daily, and the Hangar and Launch screens show which limit a design breaks and which upgrade lifts it. Core flight tools are never locked.

## Context

- ADRs: 0097, 0098
- Read: ADR 0098 point 3, ADR 0097 point 5, plan 090 (schema), 095 (ledger).

## Scope

**In:**
- Construction queue on the world tick; building state (planned, building, ready, upgrading).
- Capacity effects as typed keys read by the Hangar, Launch, crew, contracts and comms.
- Upkeep per level.
- Stock level values (three levels per building) documented.
- "Needs attention" entries for finished construction and unaffordable upkeep.

**Out:** production buildings' output (097).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sim`, `mods/stock`, `apps/web/src/routes/space-center`, `apps/web/src/routes/vab`, `apps/web/src/routes/launch`
- **Shared contracts:** **SDK (capacity effect keys on `defineBuilding`), save (construction state)**

## Design notes

A test enumerates the flight tools (maneuver nodes, Δv read-outs, map, targets, SAS modes, scripting) and asserts no capacity key gates them.

## Steps

1. Construction and upgrades on the tick.
2. Capacity keys and their consumers.
3. Upkeep.
4. UI: limits shown with the lifting upgrade.

## Acceptance criteria

- [ ] `packages/sim` test: placing a Hangar debits its cost and it becomes ready exactly after its build time in game days.
- [ ] vitest: a design of 40 parts at a level-1 Hangar (limit 30) is no-go and names "Hangar level 2: 120 parts".
- [ ] `packages/core` test: no capacity key references a flight tool (list asserted).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/096-building-catalogue-levels-upkeep-capacity.md` written.
- [ ] `guides/writing-a-mod.md` (building levels).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0098).
- 2026-10-17 — `depends` gains 094 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the Launch screen of plan 094 reads the capacity limits and this plan edits `routes/launch`.

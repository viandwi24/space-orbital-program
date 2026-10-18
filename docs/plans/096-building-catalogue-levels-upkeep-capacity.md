---
id: 096
title: "Buildings with costs, construction time, upkeep and capacity limits"
status: done
owner: "Agent 1"
depends: [091, 095, 094]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 096 — Buildings with costs, construction time, upkeep and capacity limits

## Goal

Placing a building costs funds and takes game time (built on the world tick), each building has levels whose upgrades raise capacity and scale only (part count, launch mass, pad size, crew capacity, contract slots, network power, prediction quality), upkeep is charged daily, and the Hangar and Launch screens show which limit a design breaks and which upgrade lifts it. Core flight tools are never locked.

## Context

- ADRs: 0097, 0098, [0123](../decisions/0123-construction-on-the-tick-capacity-keys-upkeep.md) (construction, capacity keys, upkeep)
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

- [x] `packages/sim` test: placing a Hangar debits its cost and it becomes ready exactly after its build time in game days.
- [x] vitest: a design of 40 parts at a level-1 Hangar (limit 30) is no-go and names "Hangar level 2: 120 parts".
- [x] `packages/core` test: no capacity key references a flight tool (list asserted).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/096-building-catalogue-levels-upkeep-capacity.md` written.
- [x] `guides/writing-a-mod.md` (building levels).
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0098).
- 2026-10-17 — `depends` gains 094 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the Launch screen of plan 094 reads the capacity limits and this plan edits `routes/launch`.
- 2026-10-18 — Claimed by Agent 1 after 094 merged. ADR 0123: construction state on the sites finished by the world tick, `upgrade-building`, upkeep every 30 days, typed capacity keys (`CAPACITY`, `siteCapacity`, `capacityUpgrade`), limits only where the economy is on; consumers: Hangar parts (no-go naming the upgrade), Launch mass (designs over the limit listed with the upgrade), crew roster. Stock values in the journal. API_VERSION 0.1.58 (0.1.53 to 0.1.57 taken by the merges of 100, 124, 105, 127 and 130).
- 2026-10-18 — Criteria: sim `building-levels.test.ts` (Hangar debited and ready on the tick of placed day + 10), vitest `capacity.test.ts` (40 parts no-go, "Hangar level 2: 120 parts"), core `capacity.test.ts` (keys against `FLIGHT_TOOLS`); full checks in the merge log. After 108 merged (launch into the newest save) the Space Center runs that save and writes it back after a change, so spending carries; the test stand of 130 got levels and the `test-stand` key.
- 2026-10-18 — Merged by Agent 1 (own lane): rebased after 100, 124, 108, 111, 105, 127, 130, 066 and 115; bun test 1632 pass, web vitest 1010 pass, typecheck, build, docs:check, smoke e2e 7 passed; space-center (Career dish under construction), worlds (an upgrade in a world with a save written back), launch, astronauts and mission-center e2e pass (Chromium).

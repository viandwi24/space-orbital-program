---
id: 127
title: "Range safety: safe azimuth fans and stage impact zones"
status: done
owner: "Agent 2"
depends: [092, 095, 078, 094, 067]
phase: 9
created: 2026-10-17
updated: 2026-10-18
---

# 127 — Range safety: safe azimuth fans and stage impact zones

## Goal

Each site has a safe launch fan computed from its geography; before launch, the predicted impact points of spent stages are checked against land and other sites; the `rangeSafety` rule decides: `cost` (default: allowed with a funds and reputation penalty shown before launch), `hard` (refused with the reason) or `off`.

## Context

- ADRs: 0097, [0155](../decisions/0155-range-safety-fans-impacts-at-staging-and-penalties.md) (this plan)
- Read: ADR 0097 point 8, ADR 0021 (debris rails), plan 092 (site consequences).

## Scope

**In:**
- Fan computation from the terrain's land/sea map around the site.
- Impact prediction for each stage separation from a nominal ascent (or the flight's actual staging in flight).
- Penalty ledger entries; a pre-launch panel on the Launch screen; an in-flight warning when an actual impact will violate.
- Rule wiring.

**Out:** crowd evacuation and fines by other agencies.

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sim`, `mods/stock`, `apps/web/src/routes/launch`, `apps/web/src/lib/hud`
- **Shared contracts:** **protocol (range-safety status in snapshot)**

## Design notes

Prediction uses the same debris ballistic model as the sim so the warning and the outcome agree.

## Steps

1. Fan computation.
2. Impact prediction.
3. Rule and penalties.
4. UI.

## Acceptance criteria

- [x] `packages/core` test: a coastal site's fan points over the sea; an inland site has a narrower fan.
- [x] `packages/sim` test: with `hard`, a launch whose first stage is predicted onto another site is refused with the reason (at the staging that drops it, ADR 0155 point 3); with `cost`, it proceeds and books the penalty once.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/127-range-safety.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097).
- 2026-10-17 — `depends` gains 094, 067 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the pre-launch panel is on the Launch screen of plan 094 and impact points use the water level of plan 067.
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2).
- 2026-10-18 — Refined with ADR 0155: the fan from the water map; the drop judged at staging from the vessel's real state on the debris conic (the sim has no Δv model, so a pre-launch prediction is the page's estimate only); the azimuth measured at 2 km; penalties once through the ledger.
- 2026-10-18 — Built: core fan, conic drop and estimate; the sim judges drops at staging and the ascent azimuth at 2 km, penalties once; the Launch panel and the HUD warning (API 0.1.55). The SDK does not re-export the range functions (not in Touches). Handed over as `ready/127`.
- 2026-10-18 — Merged by Agent 1: rebased on main after 105 (conflicts in the save, snapshot, sim core and Launch screen: tech and range kept side by side); API_VERSION 0.1.56 (105 took 0.1.55); bun test 1613 pass, web vitest 996 pass, typecheck, build, docs:check, smoke e2e 7 passed; astronauts, launch and worlds e2e pass (Chromium).

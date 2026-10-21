---
id: 280
title: "Power, comms, science and life support: surface-mount parts with their own shapes and deploy animations; fuel cell"
status: draft
owner: ""
depends: [291]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 280 — Power, comms, science and life support: surface-mount parts with their own shapes and deploy animations; fuel cell

## Goal

Solar panels (flat, folding, tracking array, stack wing pair), batteries, RTG, fuel cell, antennas (whip, folding dish, large dish, relay), every science instrument and the life-support parts have their own shapes and mount on the hull; deployables animate open and closed, can be staged and break in strong airflow; the old stack versions are hidden legacy parts.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0259, 0257
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Generators from the list in ADR 0257 point 4 (probes are in 278); new surface-mount parts; legacy flag; `stageable` and break pressure on solar and antenna modules; fuel cell module (LF+Ox to EC with start/stop and auto); OrbitX titles.
**Out:** Deployed science (284), reactor and radiators (later draft).

## Design notes

Deploy progress from the module state drives `visual.deploy`; tracking arrays turn about their mount axis (`ModuleSolarPanel` mode `track`).

## Steps

1. Generators and parts per tracker PWR/COM/SCI/LS rows.
2. Legacy flag and the Hangar replace notice.
3. Staging and break rules with tests.
4. Fuel cell module and part.

## Acceptance criteria

- [ ] A deployed folding array above its break pressure breaks and stops producing (sim test); retracted it survives.
- [ ] Old designs with stacked panels and antennas still resolve and fly (test with frozen designs).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/280-power-comms-science-life-support.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Parts delivered in plan 303: power, comms, science and containers (surface-mounted, deploy animations; old stack parts hidden). Open: breaking in airflow, the replace notice.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.

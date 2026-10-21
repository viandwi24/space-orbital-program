---
id: 297
title: "Space station modules: habitat, node hub, laboratory, truss segments, large rotating solar wings, radiators, airlock, cupola"
status: draft
owner: ""
depends: [291, 280, 281]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 297 — Space station modules: habitat, node hub, laboratory, truss segments, large rotating solar wings, radiators, airlock, cupola

## Goal

A station can be built in orbit from several launches: cylindrical habitat and laboratory modules (2.5 and 3.75 m, windows, handrails, docking ports), a node hub with six ports, square truss segments with rotating solar wings and radiator panels, an airlock and a cupola.

## Context

- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` (§11, missions and the parts they need).
- ADRs: 0257, 0261
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Generators and parts listed; radiator part (visual and a simple heat-reject value, no new heat system); multi-port node; OrbitX titles.
**Out:** Habitat life-support economy changes; crew rotation gameplay.

## Design notes

Docking-based assembly already works (ADR 0218); modules carry their own ports and RCS hooks. Large solar wings use the `track` mode of `ModuleSolarPanel`.

## Steps

1. Module generators (hab, lab, node, airlock, cupola).
2. Truss, solar wing, radiator.
3. Headless test: two modules launched separately dock in orbit to form a station.

## Acceptance criteria

- [ ] Two station modules dock and the merged vessel holds crew in both (sim test).
- [ ] `bun run lint`, `bun run typecheck`, `bun run test` and the web vitest suite with `CI=true` pass; `bun run docs:check` passes.
- [ ] Catalogue icons and a Hangar screenshot of every new part in the journal.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/297-station-modules.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers, and the mission table (§11).

## Log

- 2026-10-21 — Parts delivered in plan 303: hab and lab modules, hub, truss, radiator, airlock, cupola. Open: the docking test.
- 2026-10-21 — Drafted from the owner's mission targets of 2026-10-21 (Apollo 11, Space Shuttle, station, rover, orbiter, space telescope, research satellite): rocket parts first, rover after, robotics last.

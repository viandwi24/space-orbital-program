---
id: 277
title: "RCS family: 4-way block remodel, 5-way, linear port, corner block, bipropellant thruster, per-axis toggles"
status: draft
owner: ""
depends: [291]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 277 — RCS family: 4-way block remodel, 5-way, linear port, corner block, bipropellant thruster, per-axis toggles

## Goal

RCS parts look like the owner's reference (rounded housing with panels and keypad, dark base plate, stub pipes, ribbed hollow bronze bells) and come in the shapes players need: 4-way, 5-way (Apollo quad), linear port, corner block and a large bipropellant thruster; each axis (pitch, yaw, roll, translate) can be toggled per part.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0257, 0217
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** RCS generator rewrite with variants by `nozzles` layout; new parts; per-axis toggles in `ModuleRcs` if missing (panel and action groups); OrbitX titles.
**Out:** RCS ports built into pods (278).

## Design notes

The nozzle layout is data (directions), so the sim needs no new logic beyond the axis mask. The model's nozzles must match the module's nozzle directions (test).

## Steps

1. Rewrite `rcs-block.ts` with the kit.
2. Add the new parts and their nozzle data.
3. Axis toggles in the module and panel.

## Acceptance criteria

- [ ] A test asserts every RCS part's model nozzle directions equal its `ModuleRcs` nozzle directions.
- [ ] With roll disabled on all blocks, a roll command gives zero RCS torque (sim test).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/277-rcs-family.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.

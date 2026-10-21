---
id: 277
title: "RCS family: 4-way block remodel, 5-way, linear port, corner block, bipropellant thruster, per-axis toggles"
status: done
owner: "part visuals session (Claude)"
depends: [291]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 277 — RCS family: 4-way block remodel, 5-way, linear port, corner block, bipropellant thruster, per-axis toggles

## Goal

RCS parts look like the owner's reference (the RV-105 card): a rounded white housing with a seam band and an inset keypad, a dark base plate with corner bolts, a short stub pipe and a collar per nozzle, and ribbed, hollow bronze bells. The family covers the shapes players need: the 4-way block, a 5-way block (the 4-way cross plus one nozzle out of the front, as on a service module's quads), a 2-way pair along the hull, a 1-nozzle linear port, and the cold-gas thruster. The bells are drawn exactly where the module's nozzles push, so model, puffs and forces agree.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0257, 0217
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** `rcs-block.ts` rewritten with the kit (bells read from `visual.puffs.nozzles`); new parts `stock.rcs-block-5`, `stock.rcs-pair`, `stock.rcs-linear` in the Reaction control tech node; OrbitX titles for the five thrusters (ADR 0255); tests.
**Out:** a bipropellant (LF+Ox) thruster and pitch/yaw/roll toggles: both need sim work (`ModuleRcs` burns one propellant, and its torque demand is in the part frame), moved to draft plan 299. The existing rotation and translation toggles stay. RCS ports built into pods (278).

## Design notes

The nozzle layout is data (directions), so the sim needs no new logic beyond the axis mask. The model's nozzles must match the module's nozzle directions (test).

## Steps

1. Rewrite `rcs-block.ts`: plate, rounded housing, keypad, and per nozzle a stub, a collar and a ribbed bronze bell at the nozzle's exit, pointing along the exhaust.
2. Add the three new parts and their tech-node entries; rename the thrusters.
3. Tests: nozzle data and puffs agree, nozzles inside the box, the new layouts; shape and seam tests.
4. Icons rendered from the dev server.

## Acceptance criteria

- [x] A test asserts every RCS part's model nozzles (its puff list, which the generator draws) equal its `ModuleRcs` nozzles, inside its box (`mods/stock/test/rcs.test.ts`).
- [x] The five-way block can push the vessel inward and the pair only along the hull (same file).
- [x] Shape, seam and part-id tests pass with the new parts (`parts.test.ts`, `part-seams.test.ts`, `boot.test.ts`, the part-id snapshot: additions only).
- [x] `bun run lint` (another session's `.claude/launch.json` left out), `bun run typecheck`, `bun run test`, web vitest with `CI=true` and `bun run docs:check` pass, apart from the two script-thread tests that already fail on main (STATUS.md, Known issues).
- [x] Icons in `refs/part-visuals-and-blueprints/img/icons-after/rcs-*.png`.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/277-rcs-family.md` written.
- [x] Affected docs: none describe the RCS model.
- [x] New ADRs: none.
- [x] `docs/research/stack-versions.md`: nothing looked up.
- [x] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
- 2026-10-21 — Refined and done (owner: rocket parts first). Bipropellant thruster and axis toggles moved to draft 299. Journal 277.

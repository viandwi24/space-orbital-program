---
id: 275
title: "Size classes, part two: new tank shapes, the size filter and the rest of each class"
status: draft
owner: ""
depends: [291, 289]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 275 — Size classes, part two: new tank shapes, the size filter and the rest of each class

## Goal

The stock catalogue has a full set of structural parts in all seven classes (0.625 to 7.5 m), so the super-heavy blueprints can be built.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0256, 0212
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** (plan 289 already extends `NODE_SIZES` and adds the basic set with existing generators) the rest of each class: tanks in two or more lengths (0.625 small round tank too), stack decoupler and separator, adapters to neighbours, nose cone, heat shield (to 5 m), docking port (to 3.75 m), fairing base; booster-style tapered tank (R-7 strap-on); toroid and sphere tanks; size filter in the catalogue (XS…XXL).
**Out:** Engines and engine plates (276), bays and trusses (281).

## Design notes

Tank masses follow the existing wet:dry ratio per volume; costs from `costs.ts`. Seam tests cover every new part. The pad and launch clamps take a 7.5 m, 100 m vessel: measure.

## Steps

1. Extend `NODE_SIZES` and the catalogue size filter.
2. Add the parts per class (list in the tracker TNK-*, CPL-01/02, STR-01, AER-01, THR-01, CPL-04).
3. Tapered booster tank, toroid tank, sphere tank generators.
4. Pad and clamp check with a 7.5 m stack.

## Acceptance criteria

- [ ] Seam and node-size tests pass for every new part.
- [ ] A 7.5 m, 100 m-tall test stack stands on the pad and launches headless (`bun test packages/sim`).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/275-size-classes-to-7-5-m.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — The basic set (classes, tanks, decouplers, adapters, cones, heat shields, ports, fairing bases with existing generators) moved to plan 289 for the Linux worker; this plan keeps the new tank shapes (tapered, toroid, sphere), the catalogue size filter, separators and the pad measurement at 7.5 m.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.

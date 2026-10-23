---
id: 275
title: "Size classes, part two: toroid, sphere and tapered tanks, the round 0.625 m tank, a separator and the catalogue size filter"
status: draft
owner: ""
depends: [289, 291, 380]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 275 — Size classes, part two: toroid, sphere and tapered tanks, the round 0.625 m tank, a separator and the catalogue size filter

## Goal

The stock catalogue gains the tank shapes the size classes still lack (toroid, sphere, tapered booster, tapered adapter tank), the 0.625 m tank becomes a small round tank, a separator joins the decouplers, and the Hangar catalogue can filter parts by size class (XS to XXL).

## Context

- Already done by plan 289 (7daae713): `NODE_SIZES` runs 0.625 to 7.5 m (`packages/core/src/node-size.ts:11`); barrel tanks, decouplers, adapters, nose cones, heat shields, fairing bases and docking ports up to 7.5 m with the existing generators (`mods/stock/src/parts/tanks.ts`, `structure.ts`); `packages/sim/test/size-classes-pad.test.ts` stands a 7.5 m tower on the pad and lifts it off.
- Still open from the tracker: TNK-03 (`stock.tank-0625` is a barrel, not round), TNK-05 (tapered adapter tank), TNK-07 (toroid), TNK-09 (tapered booster tank, R-7 strap-on), TNK-10 (sphere), CPL-02 (separator).
- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` §3.3 and §4.
- ADRs: 0256 (size classes), 0212 (node sizes), 0317 (realistic stats: `mods/stock/src/parts/realism.ts`, guarded by `mods/stock/test/realism.test.ts`, plan 380), 0268 (in-game text is English).
- Code: `packages/renderer/src/parts/generators/` (`tank.ts`, `loft.ts`, `kit.ts`), `mods/stock/src/parts/tanks.ts`, `apps/web/src/lib/vab/Catalogue.svelte`, `apps/web/src/lib/editor/categories.ts`.

## Scope

**In:**
- Generators for a toroid tank, a sphere tank (with a mounting ring) and a tapered tank (booster and adapter profiles).
- Parts: TNK-05, TNK-07, TNK-09, TNK-10 in the classes the tracker's blueprints need; TNK-03 remodelled as a round tank (same id).
- CPL-02: a separator that leaves no ring on either side.
- The catalogue size filter (XS 0.625 … XXL 7.5 m), from each part's node sizes.
- The 289 pad test extended to a 100 m-tall 7.5 m stack.

**Out:** Engines and plates (276); bays and trusses (281); the ribbed panel look of the large tanks (tracker TNK-04 note), a later visual pass if wanted.

## Design notes

- Tank dry mass and capacity follow ADR 0317: a tank's dry fraction comes from its size class in `realism.ts`, and every new part needs an era entry there. Capacity scales with volume as `classTank` does in `tanks.ts`.
- A toroid or sphere has stack nodes at its mounting ring; its collider stays a cylinder unless the seam tests need more.
- Titles follow ADR 0255 and ADR 0268: `OrbitX <code> "<English nickname>"`.

## Steps

1. Toroid, sphere and tapered tank generators, with seam tests.
2. The parts (TNK-05/07/09/10), TNK-03 remodelled, CPL-02; tech placement; realism entries.
3. The catalogue size filter.
4. Extend `size-classes-pad.test.ts` to a 7.5 m, 100 m-tall stack.

## Acceptance criteria

- [ ] `bun test mods/stock` passes, including `realism.test.ts` and `english.test.ts` with the new parts, and seam and node-size tests for every new part.
- [ ] `bun test packages/sim/test/size-classes-pad.test.ts` passes with a 7.5 m, 100 m-tall stack that stands 5 s on the pad and lifts off.
- [ ] A web test shows the catalogue size filter keeping only the parts of the chosen class.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/275-size-classes-to-7-5-m.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of TNK-03, TNK-05, TNK-07, TNK-09, TNK-10, CPL-02.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: plan 289 delivered the node sizes, the barrel set and the pad test; this plan keeps the new tank shapes, the round 0.625 m tank, the separator, the size filter and a 100 m pad test, under ADR 0317 realism.
- 2026-10-21 — The basic set (classes, tanks, decouplers, adapters, cones, heat shields, ports, fairing bases with existing generators) moved to plan 289 for the Linux worker; this plan keeps the new tank shapes (tapered, toroid, sphere), the catalogue size filter, separators and the pad measurement at 7.5 m.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.

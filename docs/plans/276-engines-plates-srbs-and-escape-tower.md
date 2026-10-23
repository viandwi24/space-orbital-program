---
id: 276
title: "Engines and boosters, the rest: open-frame and shrouded presets, vernier engine, 0.625 m engine, segmented SRBs, separatron, the escape tower on Abort"
status: draft
owner: ""
depends: [291, 303, 380]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 276 — Engines and boosters, the rest: open-frame and shrouded presets, vernier engine, 0.625 m engine, segmented SRBs, separatron, the escape tower on Abort

## Goal

Each liquid engine has its own silhouette (open-frame lifter, fully shrouded large engine), a four-chamber engine with verniers and a tiny 0.625 m engine join the catalogue, solid boosters are segmented with field joints and aft skirts, a separatron pushes spent stages away, and the escape tower fires from the Abort group and carries the pod clear of a failing stack.

## Context

- Already done by plan 303 (5dc6fbb4): engine plates of 5, 8 and 9 bells (`stock.engine-plate-5/8/9`), `stock.engine-vacuum-xl`, `stock.srb-xl` and `stock.escape-tower` (`mods/stock/src/parts/missions.ts:1161`). Plan 380 added `stock.engine-plate-f1` and `stock.engine-plate-j2`. `mods/stock/test/boost-cover.test.ts` and `packages/sim/test/boost-cover.test.ts` cover the tower and boost cover leaving together on staging.
- Still open from the tracker: ENG-01/02/03 remodels (presets), ENG-06 (vernier), ENG-07 (0.625 m), SRB-01/02 (segmented look), SRB-03 (separatron).
- The tower is not in the Abort group: the Kronos builder (`apps/web/src/lib/editor/missions.ts`, `kronos`) only stages it, and no baked blueprint uses a custom slot.
- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` §3.4.
- ADRs: 0257 (generators), 0233 (Abort is the design's custom slot 0, `ABORT_SLOT` in `packages/core/src/action-groups.ts`), 0316 (stock owns the blueprints: builder, then bake), 0317 (realistic stats: every engine needs a kind in `mods/stock/src/parts/realism.ts`), 0268 (English titles).
- Code: `packages/renderer/src/parts/generators/engine.ts`, `booster.ts`; `mods/stock/src/parts/engines.ts`.

## Scope

**In:**
- Engine generator presets (open frame with pumps and plumbing; full shroud) as params of `engine.ts`; remodel `stock.engine-lv`, `stock.engine-vacuum`, `stock.engine-wide`.
- ENG-06 vernier engine and ENG-07 0.625 m engine.
- Segmented SRB look in `booster.ts` (field-joint rings, aft skirt, black band), also on the liquid booster.
- SRB-03 separatron (small radial solid, angled).
- Kronos V puts the tower (and the cover's decoupler) in the Abort group; rebake.
- A headless abort test.

**Out:** Nuclear, ion and aerospike engines (tracker ENG-08…10, a later draft).

## Design notes

- Presets share the bell code; they differ in what sits between plate and bell.
- New engines pass ADR 0317's bands: a liquid engine's dry mass is its thrust over g0 × the kind's target TWR; the separatron is a solid. Costs follow ADR 0317 point 4.
- Abort: the tower fires its motor and the cover's decoupler in one action; the pod's own decoupler below the heat shield fires too.

## Steps

1. Engine presets; remodel the three stock engines.
2. Vernier and 0.625 m engines, with realism entries and tech placement.
3. Segmented SRB generator; separatron.
4. Kronos V's Abort group in the builder; run `apps/web/scripts/bake-stock-blueprints.ts`.
5. The abort test.

## Acceptance criteria

- [ ] `bun test packages/sim` passes, including an abort test where firing the Abort group on a stack at about 1 km carries the pod at least 500 m from the stack.
- [ ] `bun test mods/stock` passes, including `realism.test.ts` and `english.test.ts` with the new parts.
- [ ] The Kronos V + Selene blueprint has the tower in custom slot 0 (web test), and the bake equality test passes.
- [ ] Every engine icon is distinct (journal sheet).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/276-engines-plates-srbs-and-escape-tower.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of ENG-01/02/03, ENG-06, ENG-07, SRB-01/02, SRB-03, SRB-04.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: plates, vacuum XL, SRB XL and the tower are done (303, 380); this plan keeps the presets, vernier and 0.625 m engines, segmented SRBs, the separatron, the tower in the Abort group and the abort test; no longer waits for 275.
- 2026-10-21 — Parts delivered in plan 303: engine plates 5/8/9, vacuum engine XL, escape tower, SRB XL. Open: engine presets, SRB remodel, separatron, abort test.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.

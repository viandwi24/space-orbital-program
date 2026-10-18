---
id: 207
title: "Part size classes, seam tests, auto shrouds, adapters and cones"
status: in-progress
owner: "Worker A"
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 207 — Part size classes, seam tests, auto shrouds, adapters and cones

## Goal

Stock parts live in one file per part family, so the parallel parts plans do not collide. Every part declares the size of each node (0.625, 1.25 or 2.5 m). The booster's inward-facing top ring is fixed, and geometry tests check every generator: outer faces point outward and each attach-face rim equals its node radius within 1 mm. Engines and decouplers grow a shroud sized to the part below them, 0.625↔1.25 and 1.25↔2.5 adapters exist with nose and tail cones in every size, and the Hangar marks joints whose sizes do not match.

## Context

- rancangan §8b.1–8b.5 (8b.1 booster ring winding, 8b.2 geometry tests, 8b.3 node sizes, 8b.4 shrouds, 8b.5 adapters and cones).
- Research: `refs/reverse-engineering-ksp-ksp2/02-vab-sph-editor.md` (node sizes and seams), `09-parts-catalogue.md` (size classes); `15d-parts-science-crew-audit-raw.md` A1 (36 stock parts, all 1.25 m: `mods/stock/src/parts.ts:38-39`).
- Evidence:
  - `mods/stock/src/parts.ts` is one 816-line file with every stock part; plans 208, 209, 210, 211, 222 and 225 all add parts.
  - `packages/renderer/src/parts/generators/booster.ts:14-20`: the top-ring profile runs top to bottom; `packages/renderer/src/parts/revolve.ts` needs bottom to top for outward normals. Tank, engine, decoupler and capsule generators are correct (rancangan §8b).
  - Generators: `packages/renderer/src/parts/generators/` (`index.ts` registry); renderer part tests in `packages/renderer/test/parts.test.ts`.
- ADRs: 0203 (KSP-grade parts pack: node sizes and adapters), 0212 (node size is a joint diameter; seam rule).

## Scope

**In:**
- Split `mods/stock/src/parts.ts` into one file per part family under `mods/stock/src/parts/` (for example `command.ts`, `tanks.ts`, `engines.ts`, `structure.ts`, `aero.ts`, `ground.ts`, `power.ts`, `science.ts`, `comms.ts`, `life-support.ts`) with shared helpers in `parts/shared.ts` and an `index.ts` that re-exports every part. Ids, behaviour and save compatibility stay unchanged.
- Booster top-ring winding fix (moved here from plan 200).
- Explicit `size` on every attach node (`0.625 | 1.25 | 2.5`) in the part schema, defaulting to the part's radius class for existing parts.
- Geometry tests for every generator: outward faces from outside views, rim radius = node radius < 1 mm, for every attachable pair.
- Auto shrouds on engines and decouplers, sized to the part attached below.
- Adapters 0.625↔1.25 and 1.25↔2.5; nose and tail cones per size.
- Hangar marks mismatched joints (text plus icon, not colour alone).

**Out:** 2.5 m tanks, engines, decoupler and heat shield (plan 210); one-click adapter insertion (P1, rancangan §8b.6); visual seam screenshots (P1, §8b.9).

## Touches

- **Size:** M
- **Edits:**
  - `mods/stock/src/parts/` (new folder: one file per family plus `index.ts`), `mods/stock/src/parts.ts` (removed or reduced to a re-export of `parts/index.ts`), `mods/stock/src/index.ts` (imports);
  - `packages/core/src/schemas.ts` and `packages/core/src/definitions.ts` (node `size`);
  - `packages/renderer/src/parts/generators/booster.ts`, `packages/renderer/src/parts/generators/` (shroud, adapter and tail-cone generators), `packages/renderer/src/parts/revolve.ts` (winding assert helper);
  - `apps/web/src/lib/editor/checks.ts` (mismatch check), `apps/web/src/lib/vab/`.
- **Shared contracts:** **stock parts layout** (`mods/stock/src/parts/`: plans 208–211, 222 and 225 add parts to these files); **SDK part schema** (node `size`; API_VERSION bump); renderer generator registry.

## Design notes

- The split is a pure move. Do it in its own commit before anything else, so other plans can rebase onto it early. `mods/stock/src/index.ts` registers parts from `parts/index.ts` in the same order as today.
- A snapshot test lists every stock part id and its key fields; the split must not change it.
- The seam test samples each generator's mesh at its node height, takes the max radius of the rim vertices and compares it with the node size / 2.
- Outward check: for each revolved profile, consecutive points must go bottom to top (the `revolve.ts` rule); the test fails with the generator name and profile index.
- Shrouds are generator output keyed on "attached below" from the vessel graph, so they appear in the Hangar and in flight alike, and drop when the part below is decoupled.

## Steps

1. Split `mods/stock/src/parts.ts` into `mods/stock/src/parts/<family>.ts` files with an `index.ts` re-export; add the part-id snapshot test. No behaviour change.
2. Fix the booster top-ring winding (`booster.ts:14-20`).
3. Node `size` in the schema and on every stock part; API_VERSION bump.
4. Geometry tests: outward faces and rim = node radius for every generator and attachable pair.
5. Auto shrouds on engines and decouplers.
6. Adapters and nose/tail cones per size; register in the stock mod.
7. Hangar mismatched-joint mark; vitest and e2e.

## Acceptance criteria

- [ ] After step 1: `bun test mods/stock` passes, including `test/part-ids.test.ts`, whose snapshot of every stock part id, mass, cost and module list is identical to the one taken before the split.
- [ ] After step 1: `bun run check:affected` passes and shows no change to part ids (the `part-ids` snapshot file is unchanged in the diff).
- [ ] `bun test packages/renderer` passes, including `test/part-seams.test.ts`: every generator's revolved profiles run bottom to top, and every attach rim matches its node radius within 1 mm; the test fails on the pre-fix booster profile.
- [ ] `bun test packages/renderer` passes `test/shrouds.test.ts`: an engine with a 1.25 m tank below gets a 1.25 m shroud; with nothing below it has none.
- [ ] `bun test packages/core` passes the schema test for node `size` (defaults for older mod parts).
- [ ] `apps/web` vitest `editor/checks.test.ts` (extended): a 2.5 m part on a 1.25 m node gives a "size mismatch" check with text.
- [ ] Chromium e2e `e2e/editor.e2e.ts` (extended): placing a nose cone on the booster in the Hangar shows no mismatch; a 0.625 cone on a 1.25 tank shows the mark.
- [ ] `bun run check:affected --e2e e2e/editor.e2e.ts` passes.
- [ ] CI green on the `ready/207` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/207-part-sizes-shrouds-adapters.md` written.
- [ ] `docs/architecture/plugin-system.md` updated (node `size`, stock parts layout).
- [ ] ADR 0203 linked.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-18 — Coordinator: the parts.ts split added as step 1 (plans 208–211, 222 and 225 run in parallel and add parts); the booster ring fix moved here from plan 200; `depends` set to none.

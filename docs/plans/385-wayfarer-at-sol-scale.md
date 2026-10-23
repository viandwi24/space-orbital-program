---
id: 385
title: "Wayfarer at Sol scale: a Shuttle for Sol rescaled and 1:1"
status: draft
owner: ""
depends: [360, 361, 380]
phase: 7
created: 2026-10-23
updated: 2026-10-24
---

# 385 — Wayfarer at Sol scale

## Goal

Since plan 380 (ADR 0317), the Wayfarer Shuttle reaches orbit in stock only:
- In Sol rescaled it loses attitude after booster separation and falls back.
- In Sol 1:1 it breaks up at about 82 s, likely from booster recontact.
- Its half-size stack is far short of a real Shuttle: the external tank holds 192 t against 736 t, and each booster 67.5 t against 500 t.

When this is done, the Wayfarer has a Sol design (`BlueprintDefinition.systems`) that flies the Shuttle's real profile, and the ascent holds the stack after the boosters go.

## Context

- ADR 0317; ADR 0316 (stock owns the blueprints, baked).
- Plan 360 (autostage spent boosters) and plan 361 (Shuttle landing and re-entry, stock).
- `apps/web/src/lib/editor/blueprint-systems.test.ts` ~103: `'stock.wayfarer-shuttle'` expects `short` in both Sol variants.
- `apps/web/src/lib/editor/missions.ts` (`wayfarer-shuttle` builder ~412), `mods/stock/src/parts/missions.ts` (external tank; `stock.srb-xl` ~1398), `mods/guidance/src/autopilots.ts` (Ascent).
- The bake: change the builder in `apps/web/src/lib/editor/missions.ts`, run `bun scripts/bake-stock-blueprints.ts` in `apps/web`, which writes `mods/stock/src/blueprints.generated.ts`; `stock-blueprints.test.ts` fails when the bake is forgotten.

## Scope

**In:** a Sol-scale tank and boosters (new parts, or more of them); booster separation clear of the orbiter; the ascent's attitude with the offset thrust after separation; the test's expectations moved to `goal`.
**Out:** re-entry and landing at Sol scale (plan 361 covers stock).

## Steps

1. Reproduce both failures with traces (attitude, separation impulse, recontact).
2. Parts or design changes; a Sol design in the blueprint's `systems`; run the bake.
3. Guidance or design fix for attitude after separation.
4. Move the test's expectations to `goal`.

## Acceptance criteria

- [ ] `cd apps/web && bunx vitest run src/lib/editor/blueprint-systems.test.ts` expects and gets `goal` for the Wayfarer in Sol rescaled and Sol 1:1.
- [ ] `cd apps/web && bunx vitest run src/lib/editor/stock-blueprints.test.ts` passes (the bake is current).
- [ ] `bun test mods/guidance`, `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md`; journal; ADR if guidance changes.

## Log

- 2026-10-23: drafted from plan 380.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; the test still expects `short` in both Sol variants; adds the blueprint bake step (ADR 0316); cites plans 360 and 361; depends adds 360 and 361.

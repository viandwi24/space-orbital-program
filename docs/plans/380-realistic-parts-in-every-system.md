---
id: 380
title: "Realistic part stats in every system; Δv targets from the world's system; blueprints per system"
status: done
owner: "realistic parts session (Claude, 2026-10-23)"
depends: [124, 289, 375]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 380 — Realistic part stats in every system

## Goal

The owner (2026-10-23): "part dengan angka realistis tanpa patch per sistem, kesulitan ditentukan sistem". Every stock part carries one set of realistic stats in every system. The Sol balance patches go. Difficulty comes from the world's system: stock is easy, Sol rescaled is medium, Sol 1:1 is fully realistic. Every Δv target the game shows comes from the world's bodies. Every stock blueprint is flown headlessly in every system it is designed for.

## Context

- ADR 0317 (this plan), ADR 0184 point 5 (superseded part), ADR 0113 (costs), ADR 0083 (trip planner), ADR 0256 (size classes)
- `mods/stock/src/parts/*.ts`, `mods/stock/src/costs.ts`; `mods/sol/src/balance.ts`, `variants.ts`
- `apps/web/src/lib/editor/trip.ts`, `vab/controller.svelte.ts`, `worlds/CreateWorld.svelte`, `onboarding/*`
- `packages/sim/test/sol-validation.test.ts` (journal 124)
- Blueprints: the developer-tools session moves them into `mods/stock` (ADR 0316); the flight tests build on that.

## Scope

In: the research note; realism rules and the recalibration of every stock part; the realism test; removing the Sol part patches; Δv targets from the world's system (Hangar, Create World, lessons); per-system blueprint declarations and headless flight tests; ADR, mod guide, system balance docs.
Out: e2e (owner's instruction); new propellant resources (hydrolox density); per-planet atmospheres.

## Steps

1. Plan, ADR 0317, research note `docs/research/realistic-part-stats.md` (real engines, stage mass fractions, the counterpart of every stock propulsion part).
2. `mods/stock/src/parts/realism.ts`: the kinds, bands, targets, size-class dry fractions and the cost rule; engines, tanks and solids use it. Realism test (bands, every part has a kind, a clear message for a part outside the bands).
3. Remove `mods/sol/src/balance.ts` and the variants' part patches; keep the rescaled body patches. Check that saves do not store patched values. Re-measure `sol-validation` with realistic multi-stage designs.
4. Δv targets from the world's system: the variant facts computed from the bodies, the Hangar loads the world's system (bodies for the trip line, checks and stability), and the lessons' figures come from the home body.
5. Blueprints per system: a `systems` declaration with optional per-system designs; headless flight tests for every stock blueprint in stock, Sol rescaled and Sol 1:1, with the expected outcome per system.
6. Docs: mod guide (realistic stats, no per-system part patches; system balance section), STATUS, journal; push in pieces.

## Acceptance criteria

- [x] `docs/research/realistic-part-stats.md` lists the reference engines and stages with sources and the counterpart of each stock propulsion part.
- [x] `bun test mods/stock/test/realism.test.ts` passes: every engine's Isp and TWR, every tank's and solid's dry fraction in its band; a synthetic part outside a band fails with a message naming the part, the value and the band.
- [x] `grep -r "target: 'part'" mods/sol/src` finds nothing; `bun test mods/sol packages/sim/test/sol-validation.test.ts` passes with unpatched parts.
- [x] The Hangar's trip line, Create World's facts and the lessons' Δv hint read the world's system (vitest for trip/facts per system).
- [x] Headless flight tests for every stock blueprint per declared system pass, with the expected outcome marked per system.
- [x] Eras (owner's follow-up): in stock, no start-of-career single stage reaches orbit, the two-stage starter does, and a heavy-lift-tier single stage does (`apps/web/src/lib/editor/eras.test.ts`); Create World labels the systems Easy · learning, Medium, Realistic.
- [x] `bun run docs:check`, `bun test`, `bun run typecheck`, `bun run build` pass.

## Docs checklist

- [x] ADR 0317, indexed; ADR 0184's status line names it.
- [x] Research `docs/research/realistic-part-stats.md`.
- [x] Mod guide: realistic stats, no per-system part patches, system balance, blueprint systems; plugin-system, glossary, spec.
- [x] `docs/STATUS.md` board row, journal `docs/journal/380-realistic-parts-in-every-system.md`.

## Log

- 2026-10-23: plan and ADR 0317 written; owner's approval quoted in the ADR.
- 2026-10-23: done. Verification (lock-serialised runs on the M5):
  - `bun test mods/stock`: 173 pass (realism 6), `bun test mods/sol`: 6 pass, `bun test mods/guidance`: 51 pass;
  - `bun test packages/sim/test/sol-validation.test.ts`: 6 pass (1:1 orbit 263 × 120 km and the Moon's sphere in 4.4 days; rescaled 119 × 60 km, 5.4 days);
  - `vitest src/lib/editor/blueprint-systems.test.ts src/lib/editor/eras.test.ts src/lib/editor/mission-flights.test.ts`: 54 pass (the per-system table is in the journal);
  - `grep -r "target: 'part'" mods/sol/src`: nothing.
  - Full-suite numbers are in the journal.
- 2026-10-23: parts, Sol patches, Δv targets, blueprint systems (API 0.1.116, after plan 381's 0.1.113), the Guidance ascent's insertion burn (heavy stacks could not turn in the coast; real-scale ascents fell back into the air), eras by tech tier (owner's follow-up via the roadmap session), Wayfarer at Sol scale split to draft plan 385.

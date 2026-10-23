---
id: 381
title: "The wider stock system: twelve new planets, moons and small bodies, and a body's appearance"
status: done
owner: "stock system expansion session (Claude, 2026-10-23)"
depends: [122, 317]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 381 — The wider stock system

## Goal

The owner (2026-10-23, "perluas sistem stock dengan planet baru. Kerjakan."): give the stock system destinations beyond Cinder, KSP-scale and fictional, with progressive difficulty, drawn right in Flight and the Map on both backends, and woven into contracts, missions, tech and lessons.

## Context

- ADR 0318 (this plan); ADRs 0119, 0121, 0178, 0180, 0273, 0308, 0310
- `mods/stock/src/bodies.ts`, `packages/core/src/schemas.ts` (body schema), `packages/renderer/src/scene.ts`, `moon.ts`, `tsl/moon.ts`, `atmosphere-model.ts`, `apps/web/src/lib/worlds/system-art.ts`
- Research: `docs/research/stock-system.md` (numbers, Δv map, windows; `bun run tools/stock-dv-map.ts`)

## Scope

In:

- the twelve bodies and their orbits, poles, air, terrain, science and regions;
- the `appearance` field (SDK), the renderer's colour maps, bands, clouds, rings and sky colours;
- the lazy moon pass;
- the system art;
- contracts, missions, tech, a lesson and discovery facts;
- tests for orbit validity, an Ochre transfer, and old saves.

Out:

- e2e (the owner's instruction);
- surface oceans on bodies other than Home;
- comet tails;
- terrain kinds beyond `craters` for the new bodies (they use craters with their own seeds).

## Steps

1. Plan, ADR 0318, research note with the Δv map.
2. Core/SDK: `appearance` in the body schema; stock: the bodies; test: hierarchy, spheres, closest approach of orbits, rings.
3. Renderer: colour maps (`body-look.ts`, pure, tested), the moon pass's map, giant, clouds, rings, sky weights, the lazy moon pass with a shared far sphere, both backends.
4. Web: system art from `appearance`; the scene config passes `appearance`.
5. Gameplay: missions (Ochre chapter), tech milestones, lesson pointer, discovery facts.
6. Tests: a headless Home → Ochre transfer with a stock rocket's Δv; a save from before loads with the new bodies.
7. Screenshots of each body from orbit and the map overview on both backends; docs; push; report to the owner in Indonesian.

## Acceptance criteria

- [x] `bun test packages/sim/test/stock-system.test.ts` passes: 15 bodies under one Sun, every SOI holds a low orbit and sits inside its parent's, no two siblings' SOIs meet anywhere along their orbits (closest approach of the curves above 1.5× the sum), Tempest's rings sit between its air and its first moon, Husk is retrograde.
- [x] `bun test packages/renderer/test/body-look.test.ts` passes: deterministic maps per pattern, Cinder's map is white, the sky weights follow `sky`.
- [x] A headless test flies Home low orbit → Ochre's SOI with a planned burn at the window and one correction, with a stage of stock parts (`stock-transfer.test.ts`).
- [x] A save made before this plan (fixture) loads; the snapshot lists the new bodies.
- [x] `bun run typecheck`, `bun test`, `bun run build`, `bun run docs:check` pass (`bun test` with the known exceptions in the Log).
- [x] Screenshots: every new body from orbit, and the map overview, on WebGPU and WebGL.

## Docs checklist

- [x] ADR 0318, indexed; research note; `docs/guides/` body authoring mentions `appearance`.
- [x] `docs/STATUS.md` board row, journal `docs/journal/381-stock-system-expansion.md`.

## Log

- 2026-10-23: written.
- 2026-10-23: done.
  - `stock-system.test.ts`: 6 pass. `stock-transfer.test.ts`: 1 pass. It departs on day 44.2, ejects at 1 096 m/s, corrects by 44 m/s, and is in Ochre's sphere after 307 days. `save-format.test.ts`: 24 pass. `body-look.test.ts`: 7 pass.
  - `bun test` over mods/stock, the sim tests touched, packages/renderer and packages/core: 1 445 pass, 0 fail.
  - Every test under packages and mods: 2 373 pass and 16 fail. Three of the failures are the career-bot wall-time tests, which time out under load; run alone, all 9 pass. The other 13 are web Svelte component tests that do not run under bun.
  - Web vitest: worlds 40 pass; missions, onboarding, mission-center and trip 169 pass.
  - `bun run typecheck` 0 errors. `bun run build` OK. `docs:check` OK.
  - Screenshots in the session notes folder `screens-381/`: every body on WebGPU and WebGL (contact sheets `381-*-sheet.jpg`) and the system and inner-system overviews.
  - Changed after the system audit's merge: tech nodes keep `landing:moon`, so the tree works in Sol.

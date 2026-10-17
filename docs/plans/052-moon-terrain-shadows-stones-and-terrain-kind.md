---
id: 052
title: "Moon terrain shadows, stones as geometry, terrain kind per body"
status: done
owner: "moon-detail session (Claude, 2026-10-17)"
depends: [049]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 052 — Moon terrain shadows, stones as geometry, terrain kind per body

## Goal

The sun casts long shadows from a crater rim, stones are real geometry you can land next to, and a third airless body with its own terrain is a data change.

## Context

- Left out of plan 049 (ADR 0058), which fixed the v1 must-fixes (light and dust). Target for all visual plans: [visual-direction.md](../product/visual-direction.md), ADR 0025.
- ADRs 0043 (one height function in `core`), 0044 (float patches), 0054 (the moon pass), 0052 (the stock moon), 0053 (frame budget), 0058, 0064 (half-resolution planet pass; the moon is a mesh pass and unaffected). Journals 044, 049, 050 (the moon surface frame: 4.7 ms in 049, 6.15 ms `high` in 050).
- The code that guessed a ground by "has a parent" or "airless after the first": `sim.worker.ts` (`createMoonTerrainField` for every body with a parent), `scene.ts` (`i > 0 && !b.atmosphere`), the sim tests' and the save tool's copies.
- Research: [terrain-shadows-and-stones.md](../research/terrain-shadows-and-stones.md) (horizon maps against a march, instanced geometry with a custom depth material). ADRs written by this plan: [0067](../decisions/0067-terrain-kind-per-body.md), [0068](../decisions/0068-terrain-shadows-and-stones-on-the-moon.md).

## Scope

**In:** `BodyDefinition.terrain` (`hills`, `craters` with a seed; API 0.1.18) and one selection function in core used by the sim worker, the scene and the tests; a sun-direction terrain shadow from the baked patch (the ground's own shader, the vessel by the same maths on the CPU); stones as instanced geometry near the camera from a world-fixed lattice, with a far form in the ground shader; screenshots and measured frame times.
**Out:** more planets; surface features to interact with; collision of stones (draft 060); `hills` drawn on a second body (draft 059).

## Design notes

See ADR 0067 (data on the body: a kind and a seed, not a function; why) and ADR 0068 (a fragment march of 24/16/10 steps by preset with a soft edge from the sun's angular size, skipped above a sun the field cannot shade; the vessel's visibility on the CPU scales the sun light and the ground divides it out; stones: cube-face chart lattice, two rock meshes, shadows by a custom depth material, the same lattice as domes in the ground shader beyond 56 m).

## Steps

1. Refine the draft, research, ADRs.
2. Core: `terrain` on the body schema, `seed` on the crater function, `createBodyTerrainField`, stock bodies name their kinds, API 0.1.18; replace the three "has a parent" guesses (sim worker, sim test, save tool).
3. Renderer: moon pass by `terrain.kind`, seed to the bake shaders; `terrain-shadow.ts` and the march in the patch/stone shaders; the vessel's light scale in the scene; `stones-model.ts`, `moon-stones.ts`, the stone shaders, the dome twin in the ground shader.
4. Tests (core, stock, sim, renderer), then measure and shoot in the browser (production build, static server, built-in browser) against a build of HEAD.
5. Docs, then the repo checks.

## Acceptance criteria

- [x] **Terrain kind, tested:** `BodyDefinition.terrain` validates (`hills`, `craters` with a seed 0 to 999; an unknown kind or seed is refused); `createBodyTerrainField` returns the moon field for craters (any parent or none), the home field for hills, `undefined` for no terrain with a parent or an atmosphere; `core/test/body-terrain.test.ts`, `mods/stock/test/boot.test.ts`. Evidence: `core/test/body-terrain.test.ts` (5 tests), `stock/test/boot.test.ts`.
- [x] **No "has a parent" heuristic left:** `grep -rnE "body\.parent\s*\?|\.parent \? create|!b\.atmosphere" apps packages mods tools examples` finds no choice of terrain or pass by parent or atmosphere; the only rule left is the first body being the planet pass, written as `i > 0 && b.terrain?.kind === 'craters'` in `scene.ts`. Evidence: the grep finds nothing (journal 052).
- [x] **A mod body with its own terrain:** a third airless body from a test plugin (a parent, no atmosphere, craters seed 7) stands the sim's lander on its own craters (`sim/test/terrain-kind.test.ts`), gets the moon pass with the seed in the renderer (`renderer/test/moon.test.ts`), and a body with a parent and no terrain is a smooth sphere in both. Evidence: `sim/test/terrain-kind.test.ts` (2), `renderer/test/moon.test.ts` ("the terrain kind decides the pass", 3).
- [x] **Shadow maths, tested:** `renderer/test/terrain-shadow.test.ts`: the shadow of a cliff ends at height over tan(elevation) (4, 8, 15 degrees), a soft edge of partial values with no jump over 0.35 between neighbours, a low sun shades part of the cratered ground and a high sun none, the skip above the free sine is exact, the lower presets' step counts shade within 10 points of the full march, the GLSL carries the constants. Evidence: 9 tests, shadow share 26 percent at 3 degrees and 0 at 60.
- [x] **GPU against the CPU twin:** in the browser, the pixels of a scene with shadows on and off against `terrainSunVisibility` at the same ground points: at least 98 percent agreement of shaded / lit over at least 300 points in three scenes (journal 052). Evidence: 357, 562 and 470 pixels in three scenes agree 99.2, 99.3 and 99.1 percent (journal 052).
- [x] **The vessel is shaded too:** `renderer/test/moon.test.ts`: the active vessel in a crater shadow gets `max(visibility, 0.03)` of the sun light (equal to the CPU twin's value), on the plain the full sun. Evidence: `moon.test.ts` "in a crater shadow the vessel keeps only a trace of the sun".
- [x] **Stones, tested:** `renderer/test/stones.test.ts`: the same place gives the same stones byte for byte, a stone is the same from any camera, cells are decided by their hash alone, never more than 1024 instances anywhere (mean and most reported), the near mesh is capped at 256, hidden above 140 m, rebuilt only after 8 m, the GLSL carries the lattice constants. Evidence: 10 tests; mean 282 and most 470 instances within 56 m over 300 random places.
- [x] **Screenshots** `docs/journal/assets/052-*.jpg`: the moon at a low sun with terrain shadows (and the same view with them off), stones near a lander. Evidence: `052-moon-low-sun-terrain-shadows.jpg`, `052-moon-low-sun-shadows-off.jpg`, `052-stones-near-lander.jpg`.
- [x] **Frame budget on the moon surface (ADR 0053 amendment):** `high` at most 14.4 ms and `medium` at most 13.3 ms sync on the M5 at 1920 x 1080 ratio 1, in the plain at a high sun, the plain at a low sun and a crater site at a low sun; journal 050's moon surface (6.15 ms `high`) as the baseline, with a build of HEAD measured the same session; the pad and the hillside code untouched and their frame times within noise. Evidence: worst case 9.66 ms `high` (crater site, 7 degree sun; HEAD 6.07), 8.64 ms `medium`; plain at a high sun 5.07 (HEAD 4.85); pad 13.68 against 14.02 (journal 052).
- [x] **Moon resume and landing tests green:** `bun test packages/sim` (moon landing at rest, save/resume), `bun test packages/core`. Evidence: `bun run test` 1 019 pass; the one failure is plan 054's uncommitted planet work, not this plan.
- [x] All repo checks: `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, web vitest, prettier on the touched files. Evidence: typecheck and `svelte-check` 0 errors, build done, web vitest 620 pass, docs:check OK, prettier clean on the touched files (journal 052).

## Docs checklist

- [x] STATUS, journal 052, ADRs 0067 and 0068 and the ADR index, research, `docs/guides/writing-a-mod.md` (the `terrain` field), `docs/architecture/overview.md`, `simulation.md`, drafts 059 and 060 on the board.

## Log

- 2026-10-17 — Created as draft from plan 049.
- 2026-10-17 — Refined draft → ready at the human's request (session: moon-detail session).
- 2026-10-17 — Started (moon-detail session). Another session's plan 054 work sits in the renderer (planet pass, atmosphere, presets): measured from clean copies of HEAD plus only this plan's files (a first build with their half-edited planet shader had a broken planet pass, so its numbers were thrown away).
- 2026-10-17 — Criterion 2 reworded: the first draft's grep pattern `i > 0 &&` also matches loops over arrays; the rule itself is unchanged.
- 2026-10-17 — Done. Terrain kind per body (ADR 0067, API 0.1.18), terrain-cast shadows (a fragment march, CPU twin for the vessel, 99 percent GPU agreement) and instanced stones (ADR 0068), screenshots, `high` moon surface at most 9.66 ms (HEAD 6.07 at the worst site), the pad unchanged. Drafts 059 (hills on a second body) and 060 (stone collision). One test of plan 054's uncommitted work fails in the tree (journal 052).

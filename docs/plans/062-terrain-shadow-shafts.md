---
id: 062
title: 'Light shafts from mountains and a cloud-shadow map for medium'
status: done
owner: 'shadows session (Claude, 2026-10-17)'
depends: [054, 056]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 062 — Terrain shafts and shared cloud-shadow map

## Goal

A sun low behind a ridge throws its shadow across the haze, and the baked cloud map of plan 054 also serves the ground's cloud shadows on `medium` (draft 056's idea, done in plan 056).

## Context

- Found, not done, in plan 054 (ADR 0070 point 6); plan 056 and ADR 0086 (the shared map); `terrainShadow` in `planet.glsl.ts` (the march this plan measured against); ADR 0036 (the baked terrain), ADR 0053 (budgets).

## Scope

**In:** terrain-cast shadow in the shaft march, measured per sample; the shared map for `medium`'s ground shadows (plan 056 does it; this plan's criterion points at it).
**Out:** the aurora (061); a sun-space shadow map of the terrain (only if the per-sample reads were over budget: they are not, ADR 0089).

## Steps

1. Refine, decide by measuring: per-sample reads of the baked cube along the sun ray. (done)
2. Pure twin and tests (`terrainReach`, `terrainReadDistance`, `terrainVisibility`, `combineOcclusion`). (done)
3. Shader, preset field `shaftTerrain`; screenshots of a ridge against a low sun; frame table. (done)

## Acceptance criteria

- [x] **Tests**: `light-shaft.test.ts` (reach, read distances, a wall above the ray blocks, flat ground at any sun height never, a ridge under half the gain is clear, the penumbra, the smallest clearance decides, combining, the deficit through the twin); a mutant with the first build's fixed penumbra fails two of them.
- [x] **Screenshots** of a ridge against a low sun, `high`, 1920 x 1080: `062-before-ridge3.jpg` / `062-after-ridge3.jpg` (sun 3 degrees) and `062-before-ridge6.jpg` / `062-after-ridge6.jpg` (6 degrees): with the reads 68 % of the frame is darker by 28 levels (against the same build with `SHAFT_TERRAIN` 0), the valley is in the ridge's shadow with a lit rim.
- [x] **Per-sample read measured**: first build (`terrainH`, three reads, patches blended) +2.2 ms on `medium` facing the sun; the cube alone with two reads: +0.4 to +0.6 ms; `high` four reads +0.5 to +0.9 ms (journal 062). The baked sun-space map was not built: the reads are inside the budget difference of plan 056's criterion.
- [x] **Frame table** `high` and `medium`: the table of journal 056 (the same scenes, two of them facing a low sun behind the ridge): at most +1.0 ms against HEAD (+0.53 and +0.86 `high`, +0.61 and +0.42 `medium` in the ridge scenes, within the noise elsewhere).
- [x] **`medium` cloud shadows from the shared map**: plan 056's criterion.
- [x] Suites and `docs:check` as plan 056.

## Docs checklist

- [x] STATUS, journal 062, ADR 0089, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by plan 054 (found, not done).
- 2026-10-17 — Refined draft → ready at the human's request (session: shadows session). Done with plan 056; the shared-map half is plan 056's.
- 2026-10-17 — Started (shadows session). The first build shaded the whole valley in front of a low sun, flat ground included: the penumbra of `terrainShadow` is a fixed share of the distance; tied to the ray's own height gain (ADR 0089).
- 2026-10-17 — Executed (shadows session). Criteria: see journal 062. Found, not done: a sun-space shadow map if a slower GPU needs it; thin beams between peaks (the home body's terrain near the pad is rolling).

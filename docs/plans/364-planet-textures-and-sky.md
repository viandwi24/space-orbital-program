---
id: 364
title: "Planet textures and sky like KSP: a baked sky with stable stars, scaled-space bakes of the planet, triplanar ground detail"
status: in-progress
owner: "planet-sky session (Claude)"
depends: [261, 340]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 364 — Planet textures and sky like KSP

## Goal

From orbit, the home planet looks like KSP's Kerbin: crisp and stable, with clear biome colours, mountains with relief shading and sharp fractal coastlines, and no blur, shimmer or glitter at any zoom. The sky has a Milky Way band, faint nebulae and stars of varied size and colour that never twinkle. Both renderers, measured.

## Context

- Owner's request (2026-10-22): the references are `refs/ksp-planet-sky-reference/ref-46…48.jpg`. Earlier they said the stars "kelap kelip … banyak titik titik bikin pusing".
- Research: `docs/research/planet-textures-and-sky.md`.
- ADRs: 0025 (procedural first), 0044 (terrain patches), 0247–0249 (WebGPU, TSL), **0306** (this plan).
- Journals: 261 (noise footprint AA), 340 (loading screen).

## Scope

**In:**
- A baked sky map (octahedral, half float) for the Milky Way, nebulae and haze, plus analytic catalogue stars drawn as energy-normalised Gaussians. GLSL and TSL.
- A scaled-space bake (cube albedo and normal) of the home planet from `surfaceAt`, read where the footprint is larger than its texel, and mid octaves for the coasts.
- Triplanar procedural detail textures near the ground.
- The biome map cached in IndexedDB, bakes warmed under the loading screen, and memory budgets per preset.
- A capture script with before and after shots and GPU times.

**Out:**
- Moons' scaled-space bakes. Their pass is separate (`moon.ts`); this is a follow-up plan if the home planet's bake is accepted.
- A PQS mesh.
- KTX2 encoding at runtime.

## Steps

1. Research note, this plan, ADR 0306.
2. Capture "before": `apps/web/scripts/capture-planet-sky.ts`, with the views orbit 100 km, orbit 2,000 km, the map, and the pad at night.
3. Sky: `sky-model.ts` (constants, shared), a GLSL bake plus the stars in `planet.glsl.ts`, and a TSL bake plus the stars in `planet-pass.ts`.
4. Scaled-space bake: a `mode` for the bake in both passes, the cube target, the blend in the ground branch, and the mid octaves.
5. Ground detail: detail texture generation, and the triplanar blend in `surfaceAt`, faded by footprint.
6. The biome map's IndexedDB cache in apps/web, bake warming, and budgets in `presets.ts`.
7. Capture "after", the docs, commit and push after each step.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including `test/sky-model.test.ts`: the star catalogue's magnitude distribution, the width floor, energy normalisation, and determinism.
- [ ] `bun test packages/core`, including the planet-map cache key or version test.
- [ ] `bun run typecheck` and `bun run build` pass.
- [ ] `bun run docs:check` passes.
- [ ] Before and after screenshots from the same cameras in `docs/journal/assets/364-*.jpg`, with GPU ms per view. The orbit views cost no more than before (+5 %).

## Docs checklist

- [ ] `docs/STATUS.md` board row.
- [ ] `docs/journal/364-planet-textures-and-sky.md`.
- [ ] `docs/architecture/rendering*.md`: sky and scaled-space bake.
- [ ] ADR 0306 linked in `decisions/README.md`.
- [ ] `docs/research/planet-textures-and-sky.md`.

## Log

- 2026-10-22 — Started. Research and ADR written.

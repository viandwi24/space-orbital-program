# 0346 — Planet maps from mod images: the biome map of a hills body

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/406-planet-mods.md
**Builds on:** ADR 0090 (hills on any body), ADR 0121 (a second hills planet), ADR 0142 (terrain seeds), ADR 0330 (mods supply data; planet height maps feed the sim's terrain), ADR 0345 (image assets)

## Context

A mod can add a planet as a body (ADR 0311), but its ground is a closed set: the home planet's procedural terrain (a hills body with a seed) or a cratered one. Plan 406 asks for a planet with its own textures whose height feeds the sim, so a vessel lands on the ground that is drawn.

## Decision

1. **The map is the biome map of a hills body.** The home planet's ground is already a height function over a biome map (RGBA8: elevation, moisture, temperature, rockiness; ADR 0036, 0142), read identically by the sim's `terrainHeight`, the renderer's CPU field and the GPU bakes. A hills body names an image in its mod's package, `terrain: { kind: 'hills', seed, map: 'maps/x.png' }`, and that image replaces the generated map: the height, the sea, the biome colours and the hills near the ground all follow from it by the code that already draws and collides them. No new pass, no new shader, nothing for the sim and the renderer to disagree on. Terrain albedo, normal and a height range of its own (the plan's `{ kind: 'map', height, albedo, normal, oceanMask }`) are not built: the biome map covers elevation, sea (below 0.46) and colour by biome, and the rest wait for what reads them.
2. **Bound to the seed.** `setMapOverride(seed, map)` in `planet-map.ts`: `cachedPlanetMap` returns the override for that seed (box-filtered or bilinearly stretched to the width asked for, memoised), so every consumer that asks for a map by seed (`createTerrainField`, `createBodyTerrainField`, the renderer's `biomeTexture`, `regions`) gets it. A body with a map must have its own `seed` (the schema says so); two bodies must not share one.
3. **Format.** An 8-bit RGBA, RGB or grey PNG, not interlaced, twice as wide as it is high, 128 to 4096 texels across (`checkTerrainMap`); read by `decodePng` (core; the zlib stream through `DecompressionStream`, so it runs in the Worker and the page). The image counts against plan 405's caps (4 MiB, 32 MiB a package) and is part of the package fingerprint, so a save that names the mod names the map.
4. **Where it is read.** The host installs the maps once per world, before anything asks for a ground: the sim Worker after `resolveMods` (`installTerrainMaps(plugins, mods.assets)`), the page in the root layout after the mod runtime (`installPageTerrainMaps`). Each decodes the same bytes, so the sim and the renderer hold equal maps; neither holds a map for a body it never visits that a mod did not declare. A map that is missing, not a PNG or the wrong shape is a problem in the loader log (`noteAssetProblem`) and the body keeps the continents of its seed.
5. **Plan 071 is done**, not folded: a second hills planet has its own seed, aerial perspective, a sky shell and sea shading; the guide's mention of "draft 071" was stale and is corrected.
6. **Mod API 0.1.123**: additive (`BodyDefinition.terrain.map`).

## Left open in plan 406 (it stays in progress)

- The planet pass's sky, sea waves and clouds for a mod planet as the home planet has them (the second planet has the moon pass's aerial perspective and sea shading; the LUT sky and the cloud layers need per-body bindings inside the 16-texture limit, and plan 397's clouds).
- Albedo and normal images, an ocean mask, a height range; the scaled-space bake and streaming of the map for far bodies (plan 403's manager).
- Frame time, the locked 60 on the lower targets, the owner's look at a landing.

## Consequences

- A mod ships a planet as an image and a body: `examples/mod-planet-sample` is 90 lines and a generated PNG, and the sim stands a vessel on 218 m of highland where the image says so.
- The sim holds one 1024 x 512 resampled map per mod planet (2 MiB) for as long as the world runs.

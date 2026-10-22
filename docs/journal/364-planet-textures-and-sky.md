# 364 — Planet textures and sky like KSP

**Plan:** [plans/364-planet-textures-and-sky.md](../plans/364-planet-textures-and-sky.md) · **Session:** planet-sky session (Claude) · **Date:** 2026-10-22

## What was done

- **Research.** `docs/research/planet-textures-and-sky.md` covers KSP 1's PQS and scaled space, KSP 2, why our ground is soft or glitters at each altitude, and what fits three r186.
- **The sky** (`sky-model.ts`, `shaders/starfield.glsl.ts`, `tsl/starfield.ts`).
  - The Milky Way is baked once into an octahedral half-float map (512² on low, 1024² above): the band, the bulge, dust lanes, hydrogen-pink and oxygen-teal nebulae, and a grain of unresolved stars.
  - The stars are a procedural catalogue in three layers, about 60,000 in all. Their magnitudes follow a power law, their colours run from blue-white to orange, and the bright ones are wider. Each star is an energy-normalised Gaussian at least 0.72 px wide, so it cannot twinkle.
  - The old per-pixel star dots and fbm band are gone. Daylight still hides the sky (`uStarBright`).
- **The scaled-space bake** (`scaled-space-model.ts`, `tsl/scaled-space.ts`, `planet.ts`).
  - The planet pass's own `surfaceAt` runs for every texel of a cube, on the height cube, at the texel's footprint. It writes albedo (square root, water in alpha) and the body-fixed normal.
  - WebGL uses two RGBA8 cube targets. WebGPU uses two 3 × 2 atlases with 32-texel gutters: twelve face textures pushed the pass past WebGPU's 16 sampled textures, and its pipeline failed.
  - Faces are 512, 1024 or 1536 by preset, baked two passes a frame after the heights, and again when the heights or the map change. The ground reads the bake from 1.2 texels a pixel and blends from 0.6.
  - `debug.scaledSpace('on' | 'off' | 'only')` and `debug.groundDetail(on)` are for checks.
- **Mid octaves** from 16 km to 2 km in both shaders. Their coast shift is capped inside the land margin.
- **Ground detail** (`detail-textures.ts`): four tiling grey maps in one 256² RGBA8 image (rock strata and cracks, grass clumps, sand ripples, snow drifts). They are generated on the CPU in 65 ms and read triplanar below an 8 m footprint at a level from the footprint.
- **The biome map cache.** Core's `planetMapKey`, `exportPlanetMaps`, `importPlanetMaps` and `PLANET_MAP_VERSION`, plus `apps/web/src/lib/planet-map-cache.ts`: IndexedDB per world. The 1024 map costs 555 ms on the main thread to generate.
- **Captures.** `apps/web/scripts/capture-planet-sky.ts` takes the four views (orbit 100 km, 2,000 km, the map, the pad at night) on either renderer, with the GPU time and the frame intervals. `SHOT_AB=1` adds the bake off / bake only shots and the detail cost.

## What surprised me

- The first WebGPU build drew nothing at 100 km: "The number of sampled textures (24) in the Fragment stage exceeds the maximum per-stage limit (16)". Hence the atlases.
- A pass that draws one face's tile must not clear the target. Each pass cleared the atlas, and only the last face survived.
- `TerrainSampler.terrainAt` with a TSL `mat3(...)` identity read zero heights in the bake. It now has `cubeAt(nB)`.
- `benchmarkAsync(6)` can read anywhere from 0.1 ms to twice the real figure. The capture takes the median of seven 20-frame runs.
- An existing console error on every WebGPU flight load comes from a twin of a GLSL material that reads a uniform it lacks (`twins.ts`). It is not from this plan: it also shows with this plan's renderer reverted.

## Verification output

GPU ms, medians of seven 20-frame runs, M5, Retina 1512 × 945 at 2×, high:

| View | WebGPU before → after | WebGL before → after |
|---|---|---|
| Pad at night | 18.62 → 18.24 | 46.62 → 42.86 |
| Orbit 100 km | 21.63 → 21.05 (bake everywhere 15.71) | 56.10 → 60.67 |

```
bun test packages/renderer: 770 pass, 0 fail
bun run typecheck / bun run build: exit 0 (svelte-check 0 errors)
bun run docs:check: OK
root bun test: 83 named failures, identical to the base commit's
```

Shots: `assets/364-{before,after}-webgpu-{orbit100,orbit2000,map,pad-night}.jpg`, `assets/364-{before,after}-webgl-orbit2000.jpg`.

## Open

- WebGL at 100 km is 8 % dearer, because of the mid octaves on procedural pixels. They could be read from the bake's normal alpha instead of four noise lookups.
- The moons' scaled-space bakes (out of scope).
- From orbit the soft look is now mostly the clouds, smeared at large footprints, and the wide cyan shallows. Neither is in the ground textures.

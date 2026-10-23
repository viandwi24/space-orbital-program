# 402 — Terrain detail

**Plan:** [plans/402-terrain-detail.md](../plans/402-terrain-detail.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0341 (0068, 0092, 0306) · **Note:** [refs/graphics-v2/01-ksp-and-mods.md](../../refs/graphics-v2/01-ksp-and-mods.md) §5

## What was done

| Where | What |
|---|---|
| `renderer/rock-scatter.ts` | the placement function: two lattice classes, biome weight, site clearance, `rocksAround` as the reference |
| `renderer/ground-rocks.ts` | the instanced meshes (near and far LOD), the cell cache with a time budget, the body-fixed root |
| `renderer/environment.ts`, `presets.ts`, `renderer-facade.ts` | wiring; `PresetSettings.rocks`; `debug.groundRocks()` |
| `renderer/test/scatter-cells.test.ts` | determinism, density 0, the size cut, biome limits, site clearance, heights are the field's |
| `web/scripts/capture-402.ts` | the before and after screens |

## Findings

- Screens are `docs/journal/assets/402-low-ground*.jpg` (before: Low draws none) and `402-high-ground*.jpg`, with `402gl-*` on WebGL: 700 rocks in view on sand at 640 m, 35 detailed and 660 plain, on both backends.
- A per-instance colour (`setColorAt`) was ignored on WebGPU and the rocks came out white; the material has one colour.
- The camera's altitude the environment knows is above the sphere; the rocks need it above the ground, so the class reads the field itself.

## Not done

- WebGPU compute placement and the WebGL2 worker (ADR 0341 point 4: CPU placement, cached, for both).
- Detail normal maps (point 7: with the ground mesh of plan 398).
- Frame-time against plan 392's baseline and the locked 60 on the lower targets: not measured. The placement is 4 ms a frame at most while the cache fills, then lookups; two draw calls and about 700 instances.
- The owner's look at 200 m, 20 m and on the ground against reference image 05.

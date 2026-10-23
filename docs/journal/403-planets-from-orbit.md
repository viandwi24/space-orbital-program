# 403 — Planets from orbit (stage 1: night lights)

**Plan:** [plans/403-planets-from-orbit.md](../plans/403-planets-from-orbit.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0344 (0306, 0330, 0342) · **Note:** [refs/graphics-v2/01-ksp-and-mods.md](../../refs/graphics-v2/01-ksp-and-mods.md) §7

## What was done

| Where | What |
|---|---|
| `renderer/night-lights.ts` | the formula (CPU reference, GLSL and TSL twins), the night factor, the constants |
| `renderer/shaders/planet.glsl.ts`, `tsl/planet-pass.ts` | the bake writes the light density in the normal map's alpha; the ground adds the lights on the night side |
| `renderer/planet.ts`, `presets.ts` | the `uCityLights` uniform; `PresetSettings.nightLights` (Low off) |
| `renderer/test/night-lights.test.ts` | day-side factor, none on ice, sea and high ground, lights on settled low land and a minority of it |
| `web/scripts/capture-403.ts` | the night-side screens |

## Findings

- The bake's normal alpha was unused (1), so the planet pass's 16 textures were not touched.
- Screens: `docs/journal/assets/403-low-a.jpg` (Low: none), `403-high-a.jpg` (High) and `403gl-high-a.jpg` (WebGL): warm clusters on the night side of Home at 1 200 km, the same places on both renderers.
- The bake is not re-run for a change of preset: the channel is always there and the uniform switches it.

## Not done (plan 403 stays in progress, ADR 0344)

- The 2D cloud cube from plan 397's weather cover, with the descent cross-fade (397's stage 1, `weather.ts`, has landed).
- Bakes for the Moon and the other stock bodies, the bake and evict manager with its budgets, the KTX2 cache, 2048 faces.
- Frame time against plan 392's baseline in orbit, the locked 60 on the lower targets, and the owner's look at Home by day and night against reference image 07.
- Cities at 100 km: the lights are the bake's, so below the bake's blend (a pixel under a texel) they fade out; the ground there has no settlements.

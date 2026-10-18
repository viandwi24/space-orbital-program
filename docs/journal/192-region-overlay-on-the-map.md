# 192 — Region overlay on the map view

**Plan:** [plans/192-region-overlay-on-the-map.md](../plans/192-region-overlay-on-the-map.md) · **Session:** Agent 1 (Lead), 2026-10-18 · **ADRs:** [0180](../decisions/0180-regions-on-bodies-regional-situations-and-dossiers.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/region-overlay.ts` | `uvDirection` (three's sphere UV layout), `regionColour`, `regionTexture` (each texel the colour of `regionAt` at its centre) |
| `packages/renderer/src/scene.ts`, `renderer.ts` | `setRegionOverlay` (a sphere per body in its holder, map view only) and `bodyDirectionAt` (the cursor's body and body-fixed direction) |
| `apps/web/src/lib/hud` | `RegionsLayer.svelte` (the toggle and the hover label), `regions-model.ts` (which bodies, the label) |
| `apps/web/src/lib/flight-loop.ts`, `routes/flight` | `Flight.setRegions` and `Flight.regionLabelAt`; the toggle under the `Map / Mission Center` switch |
| tests | renderer `region-overlay.test.ts` (4), vitest `hud/regions.test.ts` (3), Chromium `e2e/regions.e2e.ts` |

## What surprised me

- **The Mission Center is the wrong place for it.** Its system scope looks at the Sun, so the home planet is under a pixel, and it has no body focus. The flight's map view frames the vessel's body at four radii. The toggle lives there.
- **Exposure washed the tint to white.** The first try was an unlit sphere at 1.004 R, and the eye adaptation turned it pale. Mountains also poked through it. `toneMapped: false` and 1.5 % above the radius fixed both (checked on screenshots, layer on and off).
- **A texture, not a shader function.** The plan suggested a shader function. A texture from `regionAt` matches the sim by construction and needs no GLSL copy of the biome classifier. It costs 32 768 `regionAt` calls per body when the layer is switched on.

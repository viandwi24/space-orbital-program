# 406 — Planet mods (stage 1: a planet from an image)

**Plan:** [plans/406-planet-mods.md](../plans/406-planet-mods.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0346 (0090, 0121, 0142, 0330, 0345) · **Note:** [refs/graphics-v2/03-renderer-and-mod-audit.md](../../refs/graphics-v2/03-renderer-and-mod-audit.md) B6.1

## What was done

| Where | What |
|---|---|
| `core/png.ts`, `terrain-maps.ts`, `planet-map.ts`, `schemas.ts` | `decodePng`; `installTerrainMaps`; `setMapOverride`/`resampleMap`; `terrain.map` on a hills body (needs its seed); API 0.1.123 |
| `web` (`sim.worker.ts`, `mods/crew-content.ts`, `routes/+layout.ts`) | the Worker and the page install the maps of the mods' planets before a ground is asked for; problems go to the loader log |
| `examples/mod-planet-sample` | a planet (two continents, a highland) whose map is painted in code; its test installs it from the built package and sets a vessel on the highland |
| tests | `core/test/body-terrain-map` (decoder, land and sea from the image, sim = renderer's field over 1000 points to 0.01 m, bad maps reported, schema), `sim/test/terrain-map-body` (a pod rests on the image's height), the sample's |
| `web/scripts/capture-406.ts` | seeds the built package into the page's IndexedDB and shoots the planet |

## Findings

- The biome map is the whole ground of a hills body (height, sea, colour), so a map as an image needed no shader: the renderer's bake already reads it as a texture.
- In the browser with the sample installed the vessel put on the highland reads ALT 218 m (the image's height there, 218 m asserted by the tests) and the globe is drawn from orbit (`406-orbit.jpg`, night side; `406-ground.jpg`).
- A hills planet with a seed and no map had been drawn with the home planet's continents; the guide said "draft 071" for what plan 071 had done: corrected.

## Not done (plan 406 stays in progress, ADR 0346)

- Separate albedo, normal and ocean-mask images and a height range; the plan's `{ kind: 'map' }` kind.
- Sky (LUT), sea waves and clouds of the home planet for a mod planet.
- Streaming and the memory budget of the map for far bodies (plan 403's manager, not built).
- Screens at 3 km and on a lit ground, the frame-time check, the owner's landing.

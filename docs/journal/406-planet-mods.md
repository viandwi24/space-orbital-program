# 406 — Planet mods

**Plan:** [plans/406-planet-mods.md](../plans/406-planet-mods.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0346 (stage 1), 0363 (stage 2) (0090, 0121, 0142, 0330, 0345) · **Note:** [refs/graphics-v2/03-renderer-and-mod-audit.md](../../refs/graphics-v2/03-renderer-and-mod-audit.md) B6.1

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

## Stage 2 (ADR 0363, API 0.1.132)

| Where | What |
|---|---|
| `renderer/hills-look.ts`, `body-dress.ts`, `scene.ts` | a hills body with an `appearance` is drawn from far in the colours of its biome map (the ground shader's palette, the same warp); the dress's maps come from it |
| `renderer/moon.ts`, `shaders/moon.glsl.ts`, `tsl/moon.ts` | the sea's two colours are uniforms of the ground pass (stock values by default), `MoonPass.setOcean` |
| `core/body-images.ts`, `png.ts`, `schemas.ts` | `appearance.albedo` and `appearance.normal`; header-only read at install, `loadBodyImage` on demand, `releaseBodyImage` when far |
| `examples/mod-planet-sample` | an `appearance` (cloud deck, sky), a generated normal map, a green `ocean` |
| tests | `renderer/test/hills-look`, `body-dress-images` (the pixels come at 40 px and go at 24), `moon-bindings` (6 own samplers + 3 of three's within 16), the sample's |

## Findings

- The sky, sea waves and aerial perspective of a second hills planet were already the moon pass's (plan 071, ADR 0121); what was missing was the far look (a palette mottle unrelated to the continents) and the sea's colours: the plan's "sky, sea and clouds as Home" is that, not the planet pass's LUT.
- Screens: `406-ground.jpg` and `406-orbit.jpg` (stage 1, night side) against `406-after-3km.jpg` (the green sea under a lit sky from 3 km), `406-after-orbit.jpg` (the lit side from 900 km with the cloud deck at 0.4 opacity; it hides the ground at 0.85, which the first shot showed) and `406-after-ground.jpg`.
- The ocean mask is the biome map's elevation, by design (ADR 0363 point 5).
- Frame time: the sample planet was not put in the matrix; Home's numbers are in journal 403.

## Not done

- A height range of its own and the plan's `{ kind: 'map' }` kind (the biome map covers the heights, ADR 0346).
- The home planet's LUT sky on a mod planet (it has the same model, marched).
- Low and Medium on the lower targets with throttling, and the owner's landing ([manual]).

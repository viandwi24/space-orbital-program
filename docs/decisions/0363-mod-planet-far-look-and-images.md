# 0363 — A mod planet seen from far: the map's colours, albedo and normal images, the sea

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/406-planet-mods.md
**Builds on:** ADR 0346 (the biome map of a hills body), ADR 0121 (air and sea on a later hills body), ADR 0318 (body dress), ADR 0361 (bakes of other bodies), ADR 0362 (body images)

## Context

ADR 0346 let a mod's image be a hills planet's ground: the sim stands vessels on it and the ground shader colours it. From orbit the same planet was a mottle of its `appearance` palette, unrelated to the continents on the ground, and a mod could not set its sea colours or give it a picture. Plan 406 also asked for the sky, sea and clouds that Home has, albedo and normal images, an ocean mask, and streaming.

## Decision

1. **The sky and the sea are already the moon pass's.** A hills body other than the first is drawn by `MoonPass` (ADR 0121): the same analytic air march as the planet pass (`marchAtmosphere`, 6 view samples) for the ground and a sky shell for the sky from the ground and the lit limb from orbit; the sea is Fresnel, glint and waves. It samples 6 textures (the ground's cube, two patches, the colour map, the biome map, the sun-depth LUT) plus three's own three, inside the 16 a stage may sample; `test/moon-bindings.test.ts` counts them from the GLSL. The planet pass's own LUT sky stays Home's. A mod's `air` (ADR 0362) already scales this air.
2. **The sea's colours are uniforms**: `uSeaDeep` and `uSeaShallow` (linear RGB) in the GLSL and TSL ground colour, defaults the colours the shader had (`MOON_SEA`), a mod's `ocean` through `MoonPass.setOcean`. The cloud deck of `appearance.clouds` (with a `map` from ADR 0362) hides the ground from orbit and fades below its altitude, as before.
3. **A hills body is seen from far in its ground's colours.** `hillsRows` (renderer, `hills-look.ts`) colours the body's biome map (a mod's image or the seed's) with the palette of the ground shader (`hillsColour`: sea by elevation, beach, grass, forest, desert, alpine, rock, snow by moisture, temperature and rockiness) and the same `warpedLatLon` the ground reads it through, into the equirectangular map of the body's dress, at 128 x 64 first and 512 x 256 when near. The continents on the ground are the continents from orbit, and a mod's `ocean` colours the far sea too. The palette's pattern stays for craters bodies and giants.
4. **Albedo and normal images**: `appearance.albedo` and `appearance.normal`, PNGs in the package of the mod that set them, twice as wide as high, 128 to 4096 texels (`checkBodyMap`). The albedo replaces the far colours (it wins over the generated map and over a crater bake); the normal is a tangent-space map (OpenGL, green up) on the far sphere's Lambert material. They are for the far body only: the ground has its geometry.
5. **The ocean mask is the biome map's elevation** (ADR 0346: below 0.46 is sea). A separate mask would let the image and the heights disagree about where the sea is, which is the mismatched bake Kopernicus mods complain about; there is none.
6. **Streaming**: `installBodyImages` reads only a PNG's header for an albedo or a normal image and keeps its bytes (4 MiB at most); `loadBodyImage` decodes it when the body's dress comes near (40 px of radius, the dress's own threshold) and `releaseBodyImage` lets the pixels go when it is under 24 px again, so at most the near mod planets hold decoded maps (32 MiB each at 4096). The biome map and the cloud image are small and stay (ADR 0346, 0362). The 2048-texel bakes of craters bodies (ADR 0361) keep their manager and budgets; a hills body's far map is cheap and needs none.
7. **Mod API 0.1.132**: additive (`appearance.albedo`, `appearance.normal`).

## Consequences

- `examples/mod-planet-sample` is a planet with continents from its map, a normal map made from the same heights, a green sea and a cloud deck.
- A mod planet's orbit view and its ground agree; before, they did not.
- The albedo of a body is not part of the sim: it changes nothing a save depends on.

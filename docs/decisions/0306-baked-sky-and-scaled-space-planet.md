# 0306 — A baked sky with analytic stars, and a scaled-space bake of the planet from its own shader

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/364-planet-textures-and-sky.md
**Builds on:** ADR 0025 (procedural first), ADR 0044 (terrain patches), ADR 0249 (TSL twins)

## Context

From orbit, the planet pass fades every procedural octave out, and only a bilinear 3.7 km biome map is left. Coasts are soft, there is no relief, and the look is "blurry". The stars are sub-pixel hashed discs that twinkle as the camera turns. KSP draws a far planet from baked colour and normal maps, and the sky from a static cubemap (research: `docs/research/planet-textures-and-sky.md`).

## Decision

1. **The sky.**
   - **The bake.** The Milky Way band, the dust lanes, faint nebulae and the unresolved star haze are baked once into a half-float **octahedral 2D map**: 512² on low, 1024² from medium. It has mipmaps and is read with an explicit LOD from the pixel's angle. It is procedural, seeded by a constant, and the same for every world (no asset; NASA's star maps were considered and not used, see research §4).
   - **The stars** are a procedural catalogue evaluated per pixel. Each one is a Gaussian at least 0.7 px wide (wider when brighter), normalised so that its total over the pixels is its flux. Its colour comes from a temperature, and its magnitude from a power law, cut at a faint limit.
   - Both are multiplied by the existing star visibility, so daylight and the exposure still hide them.
2. **The scaled-space bake.**
   - The planet pass gains a bake mode. It evaluates the same `surfaceAt` for a cube texel's direction, on the baked terrain height, with the footprint set to the texel's size.
   - It writes two RGBA8 cube targets with mipmaps: albedo with water in alpha, and the body-fixed normal.
   - The ground branch reads the bake where the footprint is at least 1.2 texels. It blends between 0.6 and 1.2 texels, and runs `surfaceAt` alone below that.
   - Face sizes: low 512, medium 1024, high 2048. That is 8 / 34 / 134 MB with mips.
   - Spread over frames, one face per frame per target; warmed before the loading screen lets go.
3. **Mid octaves.** The coast warp and colour noise gain the 16 km to 2 km octaves in both paths. Their total coast shift is capped at 0.008 in elevation units, inside the terrain's land margin (`TERRAIN_SHAPE.landStart - SEA_LEVEL` = 0.012). The visible coast never lands on relief, and the sim's water test stays as it is.
4. **Caching.**
   - GPU bakes are not stored: re-baking is faster than reading them back.
   - The CPU biome map is stored in IndexedDB, keyed by width, seed, zones and a format version.
5. **Ground detail.**
   - Four procedural tiling textures (rock, grass, sand, snow) in one 2D atlas with mips.
   - Applied triplanar, multiplied into the albedo.
   - Faded in below a footprint of 2 m and out by a texel footprint of 1/3 texel, so they never alias.

## Consequences

- The orbit and map views read one or two texture fetches per pixel instead of `surfaceAt`, which makes them cheaper.
- The bake is up to 134 MB of GPU memory on high.
- The bake follows the terrain: a new seed or site re-bakes, like the height cube.
- Moons keep their own pass. Their bakes are a follow-up plan.

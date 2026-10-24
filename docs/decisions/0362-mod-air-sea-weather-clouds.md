# 0362 — Mod air, sea and weather coefficients, cloud images, and Meshopt models

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/405-mod-visual-data.md
**Builds on:** ADR 0345 (mod visual data, stage 1), ADR 0341 (the weather cover and the baked cloud map), ADR 0337 (ocean look), ADR 0313 (images in packages), ADR 0170 (typed patches)

## Context

ADR 0345 left four things of plan 405 open because nothing read them: cloud and weather maps, sky coefficients, ocean coefficients, and Meshopt. Plans 397 (the baked cloud map and the weather cover), 401 (the atmosphere model and the ocean look) and 403 now give each a consumer.

## Decision

1. **Air coefficients**: `BodyDefinition.air` (`airCoefficientsSchema`), every field optional and a *scale* on what the renderer derives from the body's pressure and height: `rayleigh` (three channels, 0 to 8), `mie` (0 to 8), `mieG` (−0.95 to 0.95, the glare round the sun), `rayleighHeight` and `mieHeight` (0.25 to 4), `ozone` (0 to 4), `skyBoost` and `mieBoost` (0.25 to 4). `applyAir(atmosphere, air)` in the renderer's atmosphere model applies them; absent gives the air as it was. Scales and not absolute values, so a mod cannot write a sky that depends on the pressure it forgot.
2. **Ocean look**: `BodyDefinition.ocean` (`{ shallow, deep }`, hex colours) replaces the stock sea colours of that body's planet pass (a uniform pair on both the GLSL and TSL passes).
3. **Weather**: `BodyDefinition.weather` (`{ mean 0.05 to 0.9, span 0 to 0.5 }`): the cover the clouds wander about and how far; `weatherCover(seed, t, look)` clamps to the old 0.05 to 0.9, so the cap on how cloudy a sky is stays the engine's.
4. **A cloud image**: `appearance.clouds.map` names a PNG in the package of the mod that set it (the body's owner, or a mod that patched the path); twice as wide as high, 64 to 2048 texels wide. `installBodyImages(plugins, assets)` (core) decodes them once per world after the mod runtime and returns what it could not read (a missing file, a bad PNG, a wrong shape or size), each with the mod, body and path; the body keeps its generated cover. The image replaces the cover's *coverage* channel; the weather still moves its threshold. `BodyDress` hands the image to the cloud pass in place of the noise.
5. **Meshopt**: `EXT_meshopt_compression` is allowed in a model. The decoder is three's `MeshoptDecoder`, imported lazily the first time a model that uses it loads (`usesMeshopt` in the glTF provider), so a game with none pays nothing.
6. **Ranges are checked where the field is registered**, like stage 1: an out-of-range or malformed value disables the patch (or refuses the body) and the message names the field.
7. **Mod API 0.1.131**: additive.

## Consequences

- A mod gives Home a teal sea, a redder hazier sky and a cloudier weather, and Vesper a picture for its clouds, with data alone; `examples/mod-visual-sample` does all four.
- A package with a PNG is format 3 (stage 1's rule); no new format.
- Sky coefficients on a body without an `atmosphere` do nothing; there is no air to scale.
- Plan 406 (planet maps) reuses `installBodyImages`' path for its images.

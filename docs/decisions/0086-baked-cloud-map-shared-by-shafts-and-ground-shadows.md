# 0086 — The baked cloud map serves the ground's cloud shadows as well as the light shafts

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/056-cloud-shadow-map-and-half-res-edges.md, plans/062-terrain-shadow-shafts.md
**Builds on:** ADR 0064 (cloud shadows measured and left off `medium`), 0070 (the baked cloud-coverage map of the light shafts).

## Context

Plan 050 measured the ground's cloud shadow at +1.0 to 1.2 ms on `medium` whether it reads two or three octaves, because the cost is the domain warp and the first octave of the noise (ADR 0064), and left `medium` without it. Plan 054 then baked the cloud coverage once into an equirectangular map for the light shafts (ADR 0070). The draft of plan 056 asked for the same idea for the ground: a baked map, read by one fetch, "re-baked as `uCloudAngle` moves".

## Decision

1. **One map, two channels.** The map is RG8: red is the coverage the shafts read (`smoothstep(0.08, 0.55, d)`), green the raw cloud density `d` that the ground's shadow reads (`sh *= 1 - 0.45 d`, as with the noise on `high`). Both come from the same `cloudDensityQ` of `cloud-field.glsl.ts` at three octaves.
2. **2048 x 1024 texels (1.8 km at the equator), not 1024 x 512.** A ground shadow is looked at from a few hundred metres, where the 3.7 km texel of the shafts' map would show as a blur of diamonds; the finest octave of the field has cells of about 2 km. 4 MB, one fullscreen bake on the first frame (as before), nothing on a preset switch.
3. **No re-bake as the clouds drift.** The draft's premise was wrong: the map is stored in the clouds' own frame and the shader rotates the lookup direction by `uCloudAngle` (`rotY`), so drift costs nothing. It is re-baked only when the cover changes (nothing does that today), as in ADR 0070.
4. **`cloudShadowMap` in the preset table** (`medium` true, `high` false, `low` false). `high` keeps the noise (four octaves, sharper than a 1.8 km texel); a preset has the noise (`cloudShadowOctaves` > 0) or the map, never both (tested). `CLOUD_SHADOW_MAP` is a compile-time define like the other preset knobs, so the programs are compiled by the precompile as before.

## Alternatives considered

- **Per-pixel noise at two octaves** (ADR 0064): measured, +1.0 ms. The map costs one filtered fetch.
- **The shafts' map alone (R8, coverage)**: coverage is a thresholded density; the shadow of the thin edge of a cloud would be too dark and its soft shoulder lost. A second channel is cheaper than a second map and a second bake.
- **A 4096 x 2048 map (0.9 km)**: 8 MB and a bake four times longer for a shadow that is soft by nature (45 % at most).

## Consequences

- `medium` has cloud shadows. Measured (journal 056): in the pad scene at 2.2 km, with the map against without it, 7.7 % of the pixels are darker by 7 levels on average; the frame time difference is inside the noise of the machine (+0.1 ms at the pad, +0.0 to +0.2 ms at the hillside, `medium`, minimum of pages).
- A shadow is as soft as a 1.8 km texel and follows the macro shape of the cloud (the billows are not in the map). `high` is unchanged.
- The map is 4 MB instead of 0.5 MB, on every preset (it is baked on the first frame whatever the preset, so its program compiles with the rest, ADR 0070).

# 0342 — Clouds v2: the model, and the weather map first

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/397-clouds-v2.md
**Builds on:** ADR 0330 (graphics v2), ADR 0336 (TAAU), ADR 0338 (the governor), ADR 0248, ADR 0310

## Context

The cloud cover was a constant (0.42), the cloud map was baked once per cover value, the march had no temporal reuse, and noise was computed in the shader. Plan 397 asks for weather, a temporal march on TAAU's history, compute-baked 3D noise and volumetric clouds near the vessel.

## Decision

1. **Weather (shipped).** The cover is a pure function of the world's terrain seed and the game time (`weather.ts`: three value-noise octaves of about 6 h, 1 day and 2.5 days around 0.42, within 0.05 to 0.9), so a save reloads the same sky; it is renderer data, not sim state. The cloud map is re-baked only when the quantised cover (steps of 0.02) moves, at most once per two wall-clock seconds, one step at a time, so a fast time warp costs one quad render per step and no pipeline (the cover is a uniform). The cloud-shadow map reads the same baked map and follows. The first frame takes the cover whole.
2. **The temporal march (shipped as a stochastic march resolved by TAAU).** Under TAAU the march takes half the steps (`taauCloudSteps`, at least 2) with a per-pixel start offset that changes every frame by the golden ratio (`cloudFrameOffset`), so TAAU's history integrates the missing samples; the first frame after a cut marches in full (`cloudStepsFor`, `PlanetPassTSL.cut`). The step count and the offset are uniforms, so nothing compiles on a switch. The plan's design (a quarter of the pixels in a separate cloud pass reprojected by TAAU) was not built: the march is composed inline with the ground and the air in one shader, and the measurement below shows the cloud march is not what holds the frame, so the separate pass would buy nothing now. History clamping is TAAU's own (neighbourhood clamp and depth rejection).
3. **Noise (shipped, on the CPU).** The cloud erosion's three octaves read a baked 128³ RGBA8 value-noise volume (`noise-volume.ts`, two texels per lattice cell, tiling every 64 cells, four independent channels) with `texture3DLevel`, one fetch each instead of eight pcg3d hashes. The bake is a few additions per texel on the CPU (about 90 ms at load) rather than a compute pass: it must also work on the WebGL2 fallback of the TSL renderer, which has no compute, and a second bake path would double the code for a 90 ms bake. The density's own `fbmF` keeps the hashed noise (once per pixel, not per step).
4. **Near the vessel (shipped).** Inside the slab the steps are spaced by the square of their index, so they bunch toward the camera; outside it the spacing is uniform as before.
5. **Quality (shipped).** A `clouds` look (`low`, `medium`, `high`; `CLOUD_LEVELS` gives the steps, octaves and billow detail the presets had) in the look system of ADR 0339, pinned from Settings; plan 404's profile carries it.

## Measurement

On the M5 (Chrome, 120 Hz, TAAU 0.5, governor off, `refs/graphics-v2/data/m5-clouds-*.json`) the planet pass reads 0.2 to 0.4 ms of GPU time at the pad, 3 km and 12 km, with the cloud march in it. Before and after builds, interleaved, agree within the run's noise (the machine's load was 5 to 14 throughout): clouds are not what holds the frame, which is ADR 0248's premise. The march change pays where clouds fill the screen at `high` without TAAU and on slower GPUs; that was not measured.

## Consequences

- Cover changes with game time: a screenshot depends on UT.
- The noise differs slightly from the hashed noise (trilinear between half-cell texels): cloud edges are a little softer in the before/after screenshots.
- Open: the owner's look check against reference look 6, a measurement where clouds dominate, and the separate cloud pass if a later measurement asks for it.

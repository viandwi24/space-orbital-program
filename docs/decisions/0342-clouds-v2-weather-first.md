# 0342 — Clouds v2: the model, and the weather map first

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/397-clouds-v2.md
**Builds on:** ADR 0330 (graphics v2), ADR 0336 (TAAU), ADR 0338 (the governor), ADR 0248, ADR 0310

## Context

The cloud cover was a constant (0.42), the cloud map was baked once per cover value, the march had no temporal reuse, and noise was computed in the shader. Plan 397 asks for weather, a temporal march on TAAU's history, compute-baked 3D noise and volumetric clouds near the vessel.

## Decision

The cloud model v2 is staged; each stage lands on its own and measures on its own.

1. **Weather (this ADR's first stage, shipped).** The cover is a pure function of the world's terrain seed and the game time (`weather.ts`: three value-noise octaves of about 6 h, 1 day and 2.5 days around 0.42, within 0.05 to 0.9), so a save reloads the same sky; it is renderer data, not sim state. The cloud map is re-baked only when the quantised cover (steps of 0.02) moves, at most once per two wall-clock seconds, one step at a time, so a fast time warp changes the sky in steps and costs one quad render per step, no pipeline (the cover is a uniform). The cloud-shadow map reads the same baked map and follows. The first frame takes the cover whole.
2. **Temporal march (next).** A quarter of the pixels per frame on TAAU's jitter and history (ADR 0336), a full march on cut frames (`CutDetector`), the history clamped to its neighbourhood and rejected on depth. It needs the cloud march to write a separate target the TAAU node can reproject; the planet pass today composes it inline with the ground, so the cloud march moves into its own pass first.
3. **Noise (after).** 128³ and 32³ 3D textures baked by compute at load (ADR 0308/0310), a render-pass bake for the WebGL2 fallback.
4. **Near the vessel (last).** The march works inside the slab with more steps near the camera.
5. **Quality and the switch** for clouds, consumed by plan 404.

## Consequences

- Cover now changes with game time: a screenshot depends on UT.
- Stages 2 to 5 stay open in plan 397, which remains in progress; the owner's look check against reference look 6 is open for all of it.

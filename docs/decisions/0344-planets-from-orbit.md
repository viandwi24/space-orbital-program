# 0344 — Planets from orbit: night lights first, in the bake's spare channel

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/403-planets-from-orbit.md
**Builds on:** ADR 0306 (the scaled-space bake), ADR 0318 (body appearance), ADR 0330 (graphics v2), ADR 0342 (clouds v2: the weather map)

## Context

Plan 403 asks for sharper bakes, city lights on the night side, a 2D cloud cube at orbit distance, bakes for the other bodies from their own surface functions, a per-body bake and evict manager with memory budgets, and a KTX2 cache. It is staged, as plan 397 is; each stage lands on its own.

## Decision

1. **Night lights are the first stage, in the alpha of the bake's normal map** (point 5 of the plan's design notes: a spare channel in an existing atlas, so the planet pass still samples at most 16 textures). The alpha was a constant 1.
2. **One formula, written three times** (`night-lights.ts`: the CPU reference over core's `terrainNoise`; the GLSL over `noiseT`; the TSL over its twin): none on water, on the shore (under 4 m), on high ground (fading from 60 to 700 m), on the ice (latitude 55° to 68°); three scales of value noise (regions of about 700 km, towns of 70 km, cities of 9 km) say where people live. The unit tests hold the CPU reference to those limits; the shaders carry the same numbers, and a browser look on both renderers checks them (journal 403).
3. **Shown on the night side only**: the ground shader adds `cityE × uCityLights × nightFactor(geo)` to the lit colour, warm (1, 0.72, 0.42) at 0.12 of radiance, a few times the night ground; `nightFactor` is 0 above the horizon's twilight (`geo` −0.12 to 0.05) and 1 in the night. It is read only where the bake is (far from the camera); near the ground there are no city lights (the procedural ground has no settlements).
4. **Quality** (`PresetSettings.nightLights`): Low none, Medium and High on. The uniform `uCityLights` carries it; the bake always holds the channel.
5. **Desert cores are not excluded yet**: the surface function's biome class is not an input of the bake's formula; the lowland and climate limits stand in. A later pass can take the biome map's moisture.
6. **Face sizes stay** (512, 1024, 1536 by the terrain cube's size): the budgets of 2048 faces (268 MB for both maps) belong with the streaming manager that can evict them, which is not built.

## Left open in plan 403 (the plan stays in progress)

- The 2D cloud cube and its cross-fade: it reads plan 397's weather cover (`weather.ts`) now that stage 1 of 397 has landed; it needs the cube pass and the descent fade.
- Bakes for the Moon and the other stock bodies from their surface functions, and the bake and evict manager with its memory budgets per preset.
- The KTX2 cache of finished bakes (measure the encode in a worker first).
- 2048 faces on High.

## Consequences

- A night-side view of Home from orbit shows settled lowlands as warm clusters; Low is unchanged.
- The bake takes one more `nightLightsAt` per normal texel: a few noise reads, in the same twelve passes.

# 0121 — A second hills planet: one terrain spec for sim and GPU, air through the moon pass, sea shading and shadows

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [071](../plans/071-atmosphere-and-sea-on-a-second-planet.md)
**Builds on:** ADR 0090 (hills ground on a later body), ADR 0027 (planet pass, one analytic atmosphere), ADR 0068 (terrain shadows), ADR 0142 (terrain seed and zones), ADR 0119 (the home body is named)

## Context

A later body with `terrain.kind: 'hills'` is drawn by the moon pass (ADR 0090): a biome map's colours on the hills height function, no air, a flat sea colour, no terrain shadows. Reading the code for plan 071 also showed the three height fields of such a body disagree: the sim builds it from the world's terrain seed and that body's site zones, the CPU twin in the renderer from the Legacy seed and the Legacy zone, and the GPU bake with its zone and shift uniforms never set. Two hills planets share one set of continents. A second planet pass was rejected in ADR 0090 for its cost (9 to 12.5 ms) and its coupling to the home site.

## Decision

1. **One terrain spec per later hills body**, used by the sim, the renderer's CPU field and the GPU bake: `{ seed, zones }` with `seed = terrain.seed` when the definition sets it, else the world's terrain seed mixed with a hash of the body id, and `zones` the world's site zones on that body (ADR 0142). `terrain.hills.seed` is a new optional field. The sim's catalog carries the spec of each later hills body (`Catalog.bodyTerrain`), the renderer takes it (`SceneConfig.bodyTerrain`) and the moon pass builds its biome map, its zone and shift uniforms and its CPU field from it.
2. **Air through the moon pass:** a later body with `atmosphere` gets the analytic atmosphere of ADR 0027 (`atmosphereGLSL`, its own uniforms and sun-depth table) as aerial perspective in its ground fragments, and a sky shell (a sphere at the top of the air, drawn from inside and outside with the sky-environment march), which gives the sky from its surface and the lit limb from orbit. The environment's light, fog and exposure are worked out over the body the camera is at when that body has air. Optical depth now scales with `surfacePressure / 101 325`, so a thin atmosphere looks thin; the home planet's value is unchanged.
3. **Sea shading** on the hills ground: Fresnel reflection of the sky colour, the sun's glint and the wave normal of the home sea (`waveGradient`), in patch-local metres so float32 stays exact.
4. **Terrain-cast shadows** on a hills body: the ADR 0068 march with constants for hills (relief 4 500 m, slope 1, the march distance to match), on the patches only (the globe is too coarse to shadow itself).

## Consequences

- A mod's hills planet without a `seed` gets new continents (its terrain was the home's before); stock has none.
- Clouds and launch-site buildings on a later body stay out of scope (a base is a mod's work).
- The real solar system pack (plan 124) gives Mars and Venus their skies through point 2.

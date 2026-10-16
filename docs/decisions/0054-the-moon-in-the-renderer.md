# 0054 — The moon in the renderer: its own light pass, one height function

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/044-moon-and-soi-transitions.md
**Builds on:** ADR 0025 (frame budget), 0027 (planet pass), 0036 and 0044 (baked, patched terrain), 0043 (one height function), 0051, 0052, 0053 (plan 039's governor).

## Context

Bodies other than the first are plain lit spheres (ADR 0027, consequences). The moon is a destination: seen from orbit it needs craters and a terminator, seen from its surface it needs ground that matches what the sim stands the lander on. The planet pass is one fullscreen shader for the home planet with its atmosphere, ocean, biome map, clouds and site; plan 039 is rewriting parts of it for the frame budget.

## Decision

1. **A separate `MoonPass`** (new files `moon.ts`, `moon-model.ts`, `shaders/moon.glsl.ts`) draws every airless body as a displaced sphere mesh in the scene, depth-tested, with a ShaderMaterial. The planet pass keeps drawing the home planet, stars and sun as the background; seen from the moon the planet is a disc in the sky without any change to it. No file of the planet pass is edited beyond what the scene needs to host a second pass.
2. **One height function.** `@orbital/core` `moonHeight` (ADR 0043's rule, `moon-terrain.ts`) is the physical ground; `shaders/moon.glsl.ts` is its GLSL twin built from the same constant table and the same integer hash as `terrain.glsl.ts`. A GPU readback test compares the bake with float64 (the bound of ADR 0044: 0.2 m fine patch).
3. **Two bakes, as ADR 0036 and 0044 but smaller:** a height cube map for the whole body at about 300 m per texel (orbit views, displaced icosphere, normals from the map) and a camera-centred float patch (1024 squared, 2 m per texel at the ground, larger spans higher up, re-centred like `patchNeedsRecentre`) when the camera is below 40 km. Both are baked by drawing the GLSL height function into float targets, re-done only when the patch moves; no per-pixel evaluation of the crater lattice.
4. **Shading:** grey regolith albedo with a noise tint, sun as the only light (the environment's sun direction), no atmosphere, black sky with the planet pass's stars, hard terminator, ambient from the planet's reflected light as a small blue-grey term. Shadows from terrain are cast by the displaced mesh through the sun light's shadow map like other scene objects.
5. **Budget:** the moon pass costs nothing while no airless body is within sight of the camera (hidden by distance and culling); on the moon the planet pass sees no atmosphere and no ocean at the camera, so its cost drops. The measured numbers are in the journal; home-planet scenes are unchanged because the pass is not created while the camera is in the home sphere and no moon is in view.
6. **Map view:** every body of the snapshot is drawn at its position with its SOI sphere as a faint wire sphere, orbits of vessels in the SOI of the focus body are drawn relative to that body's position, and the predicted path across a sphere boundary is drawn as two conics with the second one offset by the body's position (plan 045 extends it to nodes).

## Consequences

- Home-planet code paths are untouched; a bug in the moon pass cannot affect the pad.
- A third airless body costs only data (a terrain field and a colour).
- The GLSL twin is another place that must change with `moon-terrain.ts`; the readback test is the guard.

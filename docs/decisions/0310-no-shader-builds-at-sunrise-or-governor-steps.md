# 0310 — No shader builds at sunrise or on a governor step: sunlit warm-up frames, governor steps keep the world's resource sizes

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/373-no-shader-builds-at-sunrise.md
**Builds on:** ADR 0304 (the governor steps presets), ADR 0308 (async pipelines at load), ADR 0306 (the scaled-space bake)

## Context

The owner: the game "kadang suka freeze" at sunrise and sunset, in orbit coming out of the planet's shadow.

Reproduced on the M2 (WebGPU, the booster example in a 100 km orbit at 50× warp), with the pipelines compiled in each long frame:

- **601 ms at a sunrise:** the planet pass's upsample and edge pipelines, `ShadowMaterial`, a `MeshPhysicalMaterial`.
- **1492 ms at a governor preset step:** a new planet variant, the terrain bake's materials and the scaled-space bake (`planet-scaled-bake`).

What causes them:

1. **The sun's shadow map reaches the planet pass only while the sun is up.** The environment hands it over only when `sunUp`. On WebGPU the planet pass rebuilds every variant (full, half, upsample, edge) the first time it sees a new shadow map. A world loaded at night or over the dark side built its variants with the stand-in, then rebuilt them all at the first sunrise. The shadow camera is not fitted around the vessel while the sun is down, so the casters' shadow pipelines also first build then.
2. **A governor preset step resizes the world's baked resources.** The biome map is 512 or 1024 wide, the terrain cube 512, 768 or 1024. A step rebuilds the terrain bake and, through its key and size (512, 1024 or 1536), re-runs the scaled-space bake with new targets: new pipelines and twelve bake passes.

Plan 370's Windows follow-up (f2c3a1ce, ADR 0308 point 8) removed cause 1's planet half on its own: a preset with shadows always builds the shadow taps and reads the sun's map, or a cleared stand-in, through one node, so a new map no longer clears the variants. This ADR keeps the rest.

## Decision

1. **Sunlit warm-up frames.** `Environment.forceShadow` makes a frame fit the shadow and hand it to the planet pass as if the sun were up. The warm-up draws on both backends use it:
   - WebGPU: the load's frame and views, the other planet scale, the boot swap's frames and every warmed preset's planet paths and part models, each sunlit and as it is.
   - WebGL: every view, sunlit and as it is.
   
   Whatever the time of day at load, the casters' shadow pipelines are built before play.
   A warmed preset's planet paths are drawn in rounds of their own, apart from its part models: drawn together, the parts used up each task's 50 ms build budget and the half path was never built.
2. **On WebGPU, governor steps keep the world's resource sizes and the vessels' part detail.** (WebGL compiles every preset's own programs at load; a mixed settings set there made a planet program it never compiled, 110 to 230 ms, so WebGL takes the step's preset whole, as before.) `settingsFor(preset, resources)` takes `mapWidth`, `terrainSize` and `terrainPatch` from the *resource preset*, everything else from the step's preset. `Renderer.setPreset(preset, { governed: true })` keeps the resource preset. A plain `setPreset` makes it the new one. The flight loop's governor moves are governed; a player's choice of preset is not. The scene builds the vessels' part models at the resource preset's detail too (`SceneModel.setPreset(preset, resources)`): a step that rebuilt them made new materials and shadow pipelines in flight (100 to 200 ms on the M2). A governor step changes only per-frame costs (march steps, clouds, aurora, MSAA, the shadow map, effect budgets, vegetation counts): no terrain rebuild, no biome map, no scaled-space bake, no part models.
3. **The governor waits for the warm-up.** `QualityGovernor.setHeld`: the flight loop holds it until the renderer's precompile resolves, and that now warms every preset the governor can reach up to the ceiling, in the background (`warmPresetsFor`, ADR 0308's background stage). A move before that ended the background warm-up, so the preset's half path was built in flight.

## Alternatives

- **Key the scaled-space bake by body and seed only.** It would still be re-run by a terrain rebuild at a new cube size, and the terrain bake's own pipelines would still build mid-flight. Keeping the sizes removes both.
- **Build every pipeline async in play and draw the old look until ready.** ADR 0308 does this while loading. In play a skipped draw is a missing planet or vessel for a few frames, and the bakes cannot be skipped. Warming the reachable states is the cleaner fix. Async in play stays a fallback for what no warm-up reaches.

## Consequences

- After a governor step, a lower preset draws its ground with the start preset's map and terrain sizes and its vessels with the start preset's part detail: slightly more memory and triangles than that preset alone, no visible loss.
- The background warm-up takes 3.2 to 3.6 s on the M2 (two presets); the governor makes no move until then.
- A player's preset change still rebuilds the terrain and re-runs the bake, as before; the player chose it, at a moment they expect a change.
- `apps/web/scripts/measure-sunrise.ts` is the check: no frame over 100 ms across three orbits at 50×, from a night start and a day start, on both backends.

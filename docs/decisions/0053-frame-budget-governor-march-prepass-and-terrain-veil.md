# 0053 — Frame budget: a quality governor, a march prepass, a thinner terrain veil

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/039-performance-and-look-pass.md

## Context

After plan 031 the flight view was over the ADR 0025 budget (60 fps at 1080p on M1/M2-class GPUs) even on an Apple M5: `high` 16.0 ms at the pad and 18.6 ms on a hillside, `medium` 17.3 ms on the hillside. Mountains were a pale sheet from 3 km on, the HUD had no radar altitude, and a preset switch compiled the new planet program in the middle of a frame.

Measuring (journal 039): the machine is shared (stale flight tabs of finished sessions keep rendering and take GPU time, so one scene reads 14 or 30 ms minutes apart), `EXT_disjoint_timer_query_webgl2` is exposed but read 77 ms for 24 ms frames, and a shader program compiled after page load ran 2 to 3 times slower in the hidden pane until a second load found it in the driver's cache. So the method is: minimum over 30 windows of 8 frames in one page, every comparison A/B inside one page load by uniform or by programs that a previous load already compiled, and the results read as relative. What the profile showed at the hillside (`high`, sync): the planet pass is almost the whole frame; surface shading about 6 ms, the atmosphere 4.6, the clouds 3.2, the terrain march 5 (all together 18), and the post chain, MSAA and the vessel only 2 to 3. The number of noise octaves is not the cost (7 fewer octaves saved 0.1 ms).

## Decision

1. **Quality governor** (`quality-governor.ts`, pure and tested). The host feeds it the interval between frames; when the smoothed interval stays over 18.2 ms (55 fps) for 3 s it steps down a ladder: render scale 1, 0.85, 0.7 of the player's preset, then the next preset down at full scale, and so on to `low` at 0.55. It steps up by trial after 20 s of calm; a trial that falls over budget again within 8 s doubles the next wait (cap 160 s). The player's preset is the ceiling. Intervals over 250 ms (hidden tab, pause, shader compile) are not frames; the first 2 s after any change are not judged. `Renderer.setRenderScale` multiplies the device pixel ratio, so the canvas is simply smaller and the browser scales it up: no program recompiles. The setting `orbital.graphics.auto = off` and a pause-menu toggle turn it off (full preset, full resolution). A change shows a toast. Known limit: a browser that caps `requestAnimationFrame` at 30 Hz (battery saver) looks like a slow GPU; the toggle is the way out.
2. **March prepass.** A quarter of the pixels in each direction run a cone-widened sphere trace of the terrain (cone half angle 2.5 pixels, the ground allowed to rise at the global slope bound sideways) into a float target; each pixel then starts its own march at the block's start distance. `coneStart` in `terrain-model.ts` is the tested twin (800 random rays in the cone from two cameras never hit before the start). The prepass has its own, larger step budget (`terrainSteps` 128, 80, 48) and the pixel march a small one (`terrainRefineSteps` 40, 32, 24): the old march needed about 60 steps to see 20 km from a camera on the ground and ran out at 48 (and at 32 on `medium` the far massif was missing altogether from the hillside). Without float render targets the old march runs as before.
3. **The sun-depth table** (`sun-depth-table.ts`): the optical depth of the air from a point to the top of the atmosphere along a ray is baked once into a 128 x 64 half-float texture (25 ms, 32 kB) and read with one fetch instead of an integral per light sample. The CPU twin is tested against a 2000-sample integral (transmittance within 0.002).
4. **Site detail by distance** (`siteDetail`): grass tufts are not drawn beyond 600 m, rocks beyond 3 km, trees beyond 12 km, buildings beyond 40 km; tufts are split into a 4 x 4 grid of instanced meshes so frustum culling drops the cells behind the camera. The star field is skipped (not dimmed) when daylight hides it (`starVisibility`).
5. **Precompile**: `Renderer.precompile()` compiles this preset's scene and the other presets' planet pass with `compileAsync`, in the render-target state each preset draws in (three keys programs on tone mapping and colour space), and keeps the materials so three's program cache keeps the programs.
6. **Terrain look** (visual only): the in-scattered radiance of a ray that ends on terrain is scaled by `terrainVeil` (0.45 up to 20 km, back to 1 at 90 km, so the far sea and the horizon still meet the sky); level ground keeps all its sky ambient and a slope sees `0.5 + 0.5 cos` of it; distant slopes are shaded 4 times steeper than they are (a pixel hundreds of metres wide averages the crags away); the shadow march is not run (and fades out) beyond a footprint of 160 m, where it only blackened isolated pixels along crests. The `aerialPerspective` twin of ADR 0037 is unchanged: the bound it tests (10 km veil at most 0.6 of the ground) still holds and the on-screen veil is at most 0.45 of it.
7. **Radar altitude** in the HUD: the root part's altitude minus the clearance of the vessel's lowest point minus `VesselSnapshot.terrainHeight` (`radar.ts`), shown under the altitude while it is under 20 km.

## Alternatives considered

- **Half-resolution planet pass** with a depth-aware upsample: the largest possible saving (3 of 4 pixels) but it needs a float depth target next to the colour one for the vessel to meet the ground at full precision, and softens the pad markings and grass that make the near ground. Kept as the follow-up if the governor is not enough (draft plan, see journal).
- **Fewer march steps per preset**: at 32 the far massif disappeared and the ground speckled; the prepass makes both unnecessary.
- **Lower `high` everywhere until it fits 13.3 ms**: would remove the look the preset exists for.
- **A GPU timer in the governor**: the timer extension is not available everywhere and misread here by 3 times; the frame interval is what the player sees.
- **A real terrain change for relief** (more octaves in the core height function): the ground the sim stands on would change under every landing test; relief by shading is the visual-only way.

## Consequences

- `PRESETS` gain `terrainRefineSteps`; `terrainSteps` now means the prepass budget.
- Frame times: see journal 039. Not measured on M1/M2 or Intel (none here); the governor is what covers them.
- The draw order, the log depth and the planet pass's fragment depth are untouched.
- `Renderer` gains `setRenderScale`, `renderScale` and `precompile`; the web client owns the governor (`flight-loop.ts`).

## Amendment 2026-10-17: the reviewed budget (orchestrator review, same day)

The plan's first target (every preset at most 13.3 ms sync at five scenes) was reviewed by the orchestrator and replaced by: **`medium` at most 13.3 ms and `high` at most 16.7 ms sync on the Apple M5** at the pad, 3 km, 12 km, orbit (100 km) and a 1.6 km hillside; the governor (on by default) covers slower GPUs; a half-resolution planet pass is a post-v1 draft (plan 048) unless `medium` cannot meet its target without it. This is a reviewed exception to the plan's text, recorded in the plan's Log, not a silent weakening. `low` has no stated target and measured 5 to 10 ms.

Result (journal 039, 1920 x 1080 at ratio 1, minimum of 30 windows of 8 frames, hidden built-in pane): `high` 6.9 to 14.4 ms at the five scenes (13.7 at the worst of four hillside view directions); `medium` 7.4 to 12.8 ms (13.3 at the worst direction). `medium` first measured 14.2 ms at the hillside looking toward the far massif. Fewer march steps and view samples changed nothing there; **`medium` now uses 3 cloud octaves (was 4) and 9 ground octaves (was 11)**, which also turns the cloud shadows off on `medium` (`CLOUD_SHADOWS` is tied to four cloud octaves). The half-resolution pass was therefore not needed for the budget and is draft plan 048.

Also changed: the preset field `lightSamples` is gone (the sun ray reads the sun-depth table, `LIGHT_SAMPLES` was never used by a shader); `precompile()` builds the biome maps of the other presets' widths in idle periods (the first switch to `low` spent 0.8 to 1 s in `setPreset` building the 512-texel map; now 20 ms). **Not met:** the preset-switch hitch is still 130 to 290 ms (vegetation rebuild and terrain re-bake, not shader compiles; journal 039); the governor was verified trace-driven, because the pane's rAF intervals do not follow the GPU while hidden.

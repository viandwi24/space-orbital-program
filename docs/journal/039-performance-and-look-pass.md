# 039 — Release pass: frame budget, mountain haze, radar altitude

**Plan:** plans/039-performance-and-look-pass.md · **Session(s):** perf session (Claude, 2026-10-17, checkpoint) and integration session (Claude, 2026-10-17, completion) · **ADR:** [0053](../decisions/0053-frame-budget-governor-march-prepass-and-terrain-veil.md) (with an amendment) · **Research:** [three.md](../research/three.md) (`compileAsync`, timer query)

**Status when written: in progress.** The budget, radar altitude, the pause-menu toggle and the governor are done; two criteria are not met (preset-switch hitch, mountain contrast with clouds) and the governor run is trace-driven, see "Not met" below.

## What was done

| Where | What |
|---|---|
| `packages/renderer` (checkpoint b78c301) | quality governor state machine and `Renderer.setRenderScale`/`precompile`, march prepass, sun-depth table, site detail by distance, star skip, terrain veil and slope shading (ADR 0053, points 1 to 6) |
| `packages/renderer/src/presets.ts` | `medium` 4 to 3 cloud octaves and 11 to 9 ground octaves (the 13.3 ms budget at the hillside, below); the dead `lightSamples` field is gone (the sun ray is one fetch of the sun-depth table; `LIGHT_SAMPLES` was defined and never read by a shader) |
| `packages/renderer/src/renderer.ts`, `planet.ts` | `precompile()` also builds the biome maps of the other presets' widths, one per idle period (`PlanetPass.warmMaps`): the first switch to `low` spent 0.76 to 0.99 s inside `setPreset` building the 512-texel map |
| `apps/web/src/lib/radar.ts`, `hud-controller.ts`, `hud/InstrumentDeck.svelte` | `radarReading` (radar altitude, or `null` without terrain data or above 20 km) in `HudModel.radar`, shown as "radar 147 m" under the altitude |
| `apps/web/src/lib/hud/PauseMenu.svelte`, `routes/flight/+page.svelte` | "Automatic quality" checkbox in the pause menu, bound to `Flight.setAutoQuality` (persisted as `orbital.graphics.auto`) |

## Method and conditions

Apple M5, built-in browser pane **hidden** (the human's pane was not showing the flight; a hidden pane has `innerWidth` 0 and its rAF only runs in bursts), canvas forced to 1920 x 1080 at device pixel ratio 1 with `Renderer.resize` and `debug.setPixelRatio(1)`, quality governor off. Frame time = minimum over 30 windows of 8 frames; throughput = `debug.benchmark(8)`, sync = eight times `debug.benchmark(1)` (one frame and a 1 px read-back). Rules learned the hard way:

- **A dev server cannot be measured.** Plan 044 edits `packages/core` all the time and Vite reloads the page on every save; the numbers come from `NODE_ENV=development vite build` (the `__orbital` debug hook is dev-only) served by `vite preview` on port 5204, with a throwaway harness file in `static/` (deleted). The preview server serves `.svelte-kit/output/client`, not `build/`.
- **Feed the renderer yourself.** The flight loop calls `renderer.update(snapshot)` from its rAF callback; with rAF off (needed for a quiet GPU) a spawned vessel never reaches the renderer. The harness calls `renderer.update(sim snapshot)` after each spawn. A first measurement without it gave "3 km" and "hillside" the cost of the pad.
- **The page must be loaded at the preset being measured.** After `setPreset` the same preset measured 24 to 34 ms (twice the steady 12 to 15 ms) in two of six sessions and fine in the rest, so one table per page load. The slow state appeared with another session's tabs rendering (GPU time-slicing) and went away on its own; every number below was repeated.
- A screenshot (or anything that lays the page out) makes the page resize the canvas to 1024 x 768, and a measurement at that size reads 4 ms. Every measurement sets 1920 x 1080 first and prints the size.
- Scenes: pad = pad vessel, camera `pad-morning` (real sun); 3 km, 12 km, orbit (100 km) = a second vessel in state placement straight above the pad, camera yaw 0.9, pitch 0.02, distance 40 m; hillside = the vessel on the surface at latitude 0.009166, longitude 0.04416 (26.5 km east of the pad, ground 1 698 m, slope 5 degrees, found with `createTerrainField`), camera 25 m behind it at pitch 0.04 and the **worst of four view directions** (yaw 0, 1.57, 3.14, 4.71).

## Frame times (sync ms, throughput in brackets)

Before (journal 031 / refinement baseline in the plan): `high` pad 17.5 (14.4), hillside 21.9 (18.0); `medium` hillside 17.3 throughput.

| Scene | low | medium before the change | **medium** | **high** |
|---|---|---|---|---|
| pad, real sun | 7.3 (6.3) | 12.2 | **11.8 (9.5)** | **14.4 (11.8)** |
| 3 km, horizon | 7.3 (6.0) | 10.2 | **10.1 (8.2)** | **10.8 (9.0)** |
| 12 km, horizon | 4.9 (4.2) | 7.0 | **7.7 (6.0)** | **7.9 (6.5)** |
| orbit, 100 km | 5.1 (4.2) | 6.9 | **7.4 (6.0)** | **6.9 (6.1)** |
| hillside, view toward the valley (yaw 3.14) | 8.7 (7.5) | 12.6 | **12.8 (10.1)** | **13.0 (11.5)** |
| hillside, worst of four directions | 9.6 | **14.2** (yaw 1.57) | **13.3** (12.3 to 13.3 in three runs) | 13.7 |

The orchestrator's reviewed target (plan Log, ADR 0053 amendment): `medium` at most 13.3 ms and `high` at most 16.7 ms sync at these scenes; both are met. `medium` was 14.2 ms at the hillside looking toward the far massif (yaw 1.57); switching `terrainSteps` 80 to 64, `terrainRefineSteps` 32 to 24 and `viewSamples` 12 to 10 changed nothing there, uniform toggles showed the march is 3.5 ms of the 14 and the pad pass 12 of 14, and cloud octaves 4 to 3 together with ground octaves 11 to 9 brought it to 12.3 to 13.3. The visible price on `medium`: no cloud shadows on the ground (`CLOUD_SHADOWS` is on only at 4 cloud octaves) and a little less cloud detail. **Not measured:** M1/M2/Intel (none here); the governor and the default preset for them (`selectPreset` gives M1/M2 `medium`) are what covers them.

## Governor manual run (trace-driven)

A live run is not possible in this setup: the pane is hidden, rAF intervals there read 8.3 ms whatever the GPU does (a 12.6 Mpx canvas read 10 ms, a loop that blocked 47 ms per frame read 10 ms), so the governor would see a calm 120 Hz. What was done instead: the GPU cost of every rung of the `high` ladder was measured in the page under the load the plan names (hillside, device pixel ratio 2 on a 1920 x 1080 canvas = 8.3 Mpx): high 1.0 47.5 ms, 0.85 34.8, 0.7 24.1; medium 1.0 44.0, 0.85 32.8, 0.7 22.5; low 1.0 31.4, 0.85 26.6, 0.7 19.2, 0.55 9.9; these costs drive the real `QualityGovernor` class (frame interval = cost rounded up to 60 Hz vsync):

```
t(s)  load  level        gpu(ms)
  0.0 x2    high@1          47.5 start
  5.1 x2    high@0.85       34.8 -> high at 0.85
 10.3 x2    high@0.7        24.1 -> high at 0.7
 15.6 x2    medium@1        44.0 -> medium at 1
 20.7 x2    medium@0.85     32.8 -> medium at 0.85
 26.0 x2    medium@0.7      22.5 -> medium at 0.7
 31.3 x2    low@1           31.4 -> low at 1
 36.5 x2    low@0.85        26.6 -> low at 0.85
 41.8 x2    low@0.7         19.2 -> low at 0.7
 47.0 x2    low@0.55         9.9 -> low at 0.55     (under 18.2 ms: stops)
 62.1 x1    low@0.55        13.7 load removed (pixel ratio 2 -> 1)
 69.1 x1    low@0.7                 -> steps up after the calm
 91.1 x1    low@0.85 ... 245.2 x1 high@1   one rung every 22 s back to the player's preset
```

In the real page (`flight-loop.ts` wiring): the pause-menu checkbox sets `orbital.graphics.auto` to `off`, and with the renderer put at medium and 0.7 by hand, switching it off restored `high` at 1.0 (`039-pause-menu-auto-quality.jpg`). **Not shown:** a live step down and up by the real frame loop on a visible pane; the criterion's wording ("the log shows") is therefore met by the trace, not by a live log.

## Preset-switch hitch

`setPreset` between all three presets in a page loaded 28 s earlier (precompile finished), no warm-up, the hitch = the `setPreset` call plus the first frame after it:

| | before (no `precompile`) | `precompile` (checkpoint) | + map warm-up |
|---|---|---|---|
| first switch to `high` | 45 + 68 (max in 40 frames 146) | 43 + 43 | 50 + 109 |
| first switch to `low` | **770 + 137** | **755 + 152** | **20 + 128** |
| first switch to `medium` | 71 + 39 | 59 + 39 | 65 + 67 |
| revisits (high, low, medium) | 127 + 68, 13 + 29, 101 + 44 | 114 + 36, 12 + 21, 97 + 32 | 207 + 81, 15 + 38, 71 + 84 |
| steady frame of the target | 16 / 12 / 14 | 16 / 10 / 14 | 16 / 10 / 15 |

**Not met** (at most 4x the steady frame, i.e. 60 ms on `high`): the worst hitch is 130 to 290 ms. Measured reasons (a temporary `performance.measure` around the parts, removed): the compile of the planet pass was never the main cost (`precompile` took about 100 ms off the first switch to `high` and nothing off `low`); `PlanetPass.setQuality` rebuilt the 512-texel biome map in 0.97 s on the first visit to `low` (fixed by the warm-up: 20 ms now); `SiteGroup.setTrees` regenerates the instanced trees and grass tufts on every switch (48 to 207 ms); the first frame re-bakes the terrain cube map and patches when `terrainSize`/`terrainPatch` change (40 to 130 ms). Reaching 4x needs the site vegetation to be rebuilt incrementally (or kept per preset) and the bake spread over frames; left as a follow-up in the draft plan below.

## Mountains

The checkpoint screenshots (`039-before-*`, `039-after-*`, 1920 x 1080, same camera) measured on fixed rectangles chosen once over the land band (12 km: x 100 to 1800, y 280 to 700; 3 km: x 0 to 1900, y 580 to 800), luminance standard deviation:

| View | before | after | ratio | share above 240/255 before / after |
|---|---|---|---|---|
| 3 km | 19.9 | 30.2 | **1.52** | 0 / 0 |
| 12 km, no clouds | 29.1 | 45.8 | **1.58** | 0 / 0 |
| 12 km, with clouds (cloud shadows and the deck cover the band) | 17.5 | 21.2 | **1.21** | 0 / 0 |

The checkpoint's 1.31 for the 12 km view used a rectangle that is not recorded; the ratio moves with the rectangle by more than the margin, so the 12 km figure is **met without clouds and not met with them**. The "share above 240" part of the criterion is vacuous: neither the before nor the after image has a pixel that bright inside the rectangle (the pale look is a low-contrast mid-grey, not clipping). The `aerialPerspective` tests of ADR 0037 pass unchanged. A visual check of the current tree after the shader debug hooks were removed (3 km camera over the pad, built-in browser) shows the sky, the cloud deck, the haze and the terrain without any debug colour or missing pass. I did not attempt a further far-patch or relief change: it needs a measure/shader loop of several builds for a criterion whose rectangle was ambiguous in the first place.

## Radar altitude

`radarReading(tele.altitude, clearance, v.terrainHeight)` in `hud-controller.ts`; shown under the altitude while it is under 20 km. Screenshots: ascent over the pad (`039-radar-readout-ascent.jpg`: altitude 304 m, radar 304 m), hillside (`039-radar-readout-hillside.jpg`: "1.70 km above Home, radar 0.0 m" for a vessel standing on the 1 698 m hill; the HUD vessel of a flight always launches from the pad, so this scene was made by quicksaving a sim with a second vessel on the hill, changing the `focus` of the stored record to it and loading the save). During the plan 042 ascent the radar read 18.9 km at an altitude of 19.4 km (ground 500 m higher downrange), and it is absent above 20 km (`043-integrated-resumed-ascent.jpg`). Without terrain data `radarReading` is `null` and the line is not drawn (vitest). `ship.radarAltitude` for scripts was not added: the script telemetry has no part shapes for the ground clearance (the web HUD derives it from the design), so it is not trivial; `ship.altitude` plus a `terrainHeight` field would be the cheaper form and belongs to draft 035.

## Surprises

- Medium and low measured 2 to 3 times slower for minutes after a preset switch on two occasions and then were normal; the cause is GPU contention from other sessions' tabs, not the code (the same page measured 13 ms an hour later). Every table row was repeated.
- `vite preview` serves `.svelte-kit/output/client`; copying a file to `build/` does nothing.
- `git add -N .` marks every untracked file of other sessions as intent-to-add; undone with `git rm --cached` on those paths before committing.
- The `.`/`,` warp keys did not react to the browser tool's synthesized key events (the on-screen warp buttons did, 50x from the loaded orbit, 99.8 s in 2 s); `z`, `t`, `2`, `Space`, `Escape`, `F5` all worked.

## Not met, not done

- **Preset-switch hitch**: not met (above). **Mountain contrast with clouds**: 1.21 (met without clouds). **Governor**: trace-driven, not a live log.
- A half-resolution planet pass was not needed for the budget (`medium` met its target by cutting octaves); it is draft plan 048 for slower GPUs.
- M1/M2/Intel measurements; `ship.radarAltitude`.

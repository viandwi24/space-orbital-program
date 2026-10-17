# 050 — Half-resolution planet pass and cloud shadows on medium

**Plan:** plans/050-half-resolution-planet-pass.md · **Session:** half-res session (Claude, 2026-10-17) · **ADR:** [0064](../decisions/0064-half-resolution-planet-pass.md) · **Research:** [three.md](../research/three.md) (plan 050)

**Status when written: criteria met, cloud shadows on `medium` not adopted** (measured, over the budget; the criterion allowed that outcome). Not measured on M1/M2, Intel or a phone-class GPU: none is available here, so the ladder's order is by Apple M5 cost only.

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/half-res.ts`, `shaders/upsample.glsl.ts` | the depth-aware upsample (tested twin of the weights, GLSL that reads four texels and writes colour and `gl_FragDepth`) |
| `planet.ts`, `shaders/planet.glsl.ts` | `PlanetPass` draws its material into a float RGBA target at half the scene target's side (alpha = fragment depth, `uPackDepth`), the upsample takes its place in the scene; pixel angle, march prepass and its target follow the pass's own size; `beginFrame`, `drawHalf`, `setPlanetScale` |
| `renderer.ts` | `Renderer.setPlanetScale`, `planetScale`, `halfPlanetAvailable`; `precompile` compiles the upsample in both target states and the planet pass in the float-target state for the preset that draws to the canvas |
| `quality-governor.ts` | `GovernorLevel.planetScale`; ladder `full, 0.85, half at 1, half at 0.7` per preset (+ `half at 0.55` on `low`); no half rungs without float targets |
| `presets.ts`, `planet.glsl.ts` | `cloudShadowOctaves` replaces the `cloudOctaves >= 4` test (high 4, medium 0, low 0); `CLOUD_SHADOW_OCTAVES` for the shadow's density |
| `apps/web/src/lib/flight-loop.ts` | `applyLevel` also calls `setPlanetScale`; the governor is built with `halfPlanetAvailable`; the toast says "sky and ground at half detail" |
| tests | `half-res.test.ts` (7), ladder tests in `quality-governor.test.ts`, `cloudShadowOctaves` in the preset ordering |

## Method

Production build of a clean copy of HEAD plus these changes (`git archive HEAD` into the scratchpad, `NODE_ENV=development vite build` so `__orbital` exists; the working tree held other sessions' unfinished plans, one of which broke the flight page with a Svelte `each_key_duplicate`), served by a small Bun static server (with a POST endpoint that writes canvas PNGs), built-in browser pane (hidden), canvas forced to 1920 x 1080 at ratio 1, rAF stubbed, governor off, sync frame = mean of 8 `debug.benchmark(1)`, value = minimum over 20 windows. Scenes by synthetic snapshots (the live pad snapshot with the vessel moved: straight above the pad at 3, 12 and 100 km; the hillside of journal 039 at latitude 0.009166, longitude 0.04416, 1.7 km, two view directions; the moon at ground height 3 413 m read from the baked patch, 3 420 m). One page load per preset, after a warm-up load (changing text in a shader compiles a program that runs 2 to 3 times slower in the hidden pane until a second load: the cloud-shadow A/B was wrong twice for that reason, and twice more because another session fronted its own tab on the same GPU).

## Frame times (sync ms, full against half, `setPlanetScale(1)` and `(0.5)`)

| Scene | low | medium | high |
|---|---|---|---|
| pad (`pad-morning`) | 7.59 to **3.55** | 11.82 to **7.60** | 15.45 to **8.85** |
| 3 km | 7.01 to **2.49** | 10.31 to **4.80** | 10.86 to **5.47** |
| 12 km | 5.12 to **2.25** | 7.72 to **4.33** | 8.45 to **4.86** |
| orbit, 100 km | 2.04 to **1.76** | 3.76 to **3.22** | 4.42 to **3.78** |
| hillside, view 1.57 | 9.30 to **3.39** | 12.06 to **5.72** | 14.00 to **6.29** |
| hillside, view 3.14 | 9.71 to **3.49** | 13.27 to **6.06** | 14.05 to **6.15** |
| moon surface (3 420 m, own scene) | 4.34 to **3.41** | 6.43 to **5.30** | 6.15 to **6.19** |

The `high` pad reads 15.45 here and 13.9 in two other runs the same hour (the machine is shared and warm); the half column moved less (8.1 to 8.9). The saving on `high` is 43 percent of the frame at the pad, 50 at 3 km, 55 at the hillside; on the moon surface and at orbit it is under 1 ms (the moon is a mesh pass; the planet pass is a black sky there).

**Planet pass plus post chain only** (everything else of the scene hidden, an earlier run of the same code, `high`): pad 9.29 to 4.61 (**-50 percent**), 3 km 9.85 to 4.44 (**-55**), hillside 12.51 to 5.25 (**-58**). The fixed part (MSAA resolve, bloom, output) is about 2 ms of that, so the pass itself falls by about two thirds, from the 0.75 the pixel count allows minus the upsample.

**The rung beside it**, `high`, rows of the same run: 

| | pad | hillside |
|---|---|---|
| full | 13.89 | 12.91 |
| all at 0.85 | 11.07 | 9.78 |
| all at 0.7 | 8.53 | 7.06 |
| planet half, frame 1 | **8.15** | **5.90** |
| planet half, frame 0.85 | 6.84 | 4.71 |
| planet half, frame 0.7 | 5.64 | 3.75 |

so "half at 1" costs no more than "0.7", and the vessel and HUD stay at full resolution: it sits right after 0.85 in the ladder (ADR 0064).

## Cloud shadows on `medium`

`medium` page, programs warmed by a previous load, three interleaved rounds, minimum: pad no shadows 11.83, shadows at 2 octaves 13.04, at 3 octaves 13.18; hillside (view 1.57) 12.32, 13.30, 13.36. So the shadow costs 1.0 to 1.2 ms, hardly less at two octaves (the cost is the warp and the first octave), and the worst hillside direction (13.27 without) would be about 14.4: over the 13.3 ms budget. **`medium` stays without cloud shadows** (`cloudShadowOctaves` 0); draft 056 has the idea of a baked map of the cloud field.

## Visual check (1920 x 1080, `high`, full against half)

Files in `assets/`: `050-pad-full-vs-half.png` (1:1 crop, full above half), `050-contact-crop-3x.png` (vessel on the pad at 4x, nearest), `050-moon-full-vs-half.png`, `050-hillside-full-vs-half.png`, `050-3km-full-vs-half.png`.

| Scene | raw mean abs diff (RGB) | blurred (Gaussian 12 px) | mean colour full minus half |
|---|---|---|---|
| pad | 6.55 / 6.56 / 4.49 | **1.27 / 1.29 / 0.90** | -0.7 / -0.9 / -0.4 |
| pad on `low` (tone mapping moves into the upsample) | n/a | 1.42 / 1.49 / 0.96 | -1.0 / -1.2 / -0.5 |
| moon surface | 0.19 | 0.18 | -0.2 |
| hillside | 1.5 / 1.4 / 1.4 | 0.94 / 0.90 / 0.89 | -0.9 |
| 3 km | 7.5 / 6.5 / 3.2 | **5.6 / 5.2 / 2.2** | +4.7 / +4.5 / +1.7 |

By eye (crops): the vessel is as sharp as at full resolution and there is no halo or step where it meets the pad (the upsample writes a smooth depth); the pad markings and the grass are softer, not broken; the sky and cloud edges, and ridge lines against the sky, show 2 x 2 steps; the far ground loses fine detail about twice as near (rivers thinner than a pixel at 3 km vanish; the terrain's own shadows and the shading of far slopes depend on the pixel's footprint, which doubled), which is where the 3 km figure comes from. The default path does not change; the half rung is what the governor takes instead of drawing everything at 0.7.

## Hitch

`setPlanetScale` and `setRenderScale` together, `high`/`low`, longest of the 120 frames after the change against 4x the steady frame of the target: pad full to half 13.5 ms (bound 37), half to full 19.5 (59), hillside 0.85 full to 1 half 9.8 (26), half 1 to half 0.7 8.5 (16), half 0.7 to full 18.7 (56), `low` first use of the half pass 8.8 (15): none near the bound. Preset switches, six in a row on a page loaded 60 s before, this tree: first frame 34 to 46 ms (`medium` first visit 82 ms in the call), against the unchanged HEAD on its own page the same hour: 28 to 86 ms (`medium` first visit 83 ms in the call): **not worse than before**, and the same size as journal 048's table.

## Not met / not done

- M1/M2, Intel and a phone-class GPU: not available. The order of the rungs (and the 0.5 factor) may want a second look there.
- The governor in the live frame loop with the half rung was not run (hidden pane, the interval does not follow the GPU: journal 039); the ladder is covered by the unit tests, the step is `setPreset` + `setRenderScale` + `setPlanetScale`.
- Cloud shadows on `medium`: measured, not adopted (above).
- Sharper edges at the half rung, a baked cloud-shadow map: draft [056](../plans/056-cloud-shadow-map-and-half-res-edges.md).

## What surprised me

- The first attempt at a `medium` A/B toggled a `defines` value at run time: every compiled-after-load variant measured 25 to 31 ms against 12 to 13 for the precompiled one. The measurement is only valid after a warm-up load.
- Another session's tab, fronted on the same pane, doubled the numbers for two runs; the tool says "this tab is not fronted" when that happens. Rerun when `tabs_context` shows one tab.
- The moon scene I first used was 3.4 km inside the ground (the moon's reference sphere is far below its terrain); the ground height must be read from the baked patch.
- `uPixelAngle` is not only an anti-aliasing knob: every footprint-driven fade of the planet shader keys on it, so a half-resolution pass is also a different look at distance, not just a softer one. Scaling it was still right (an unfiltered half pass would shimmer).

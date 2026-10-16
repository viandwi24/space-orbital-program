# 048 — Cheaper preset switches

**Plan:** plans/048-half-resolution-planet-pass.md · **Session(s):** switch session (Claude, 2026-10-17) · **ADR:** [0055](../decisions/0055-cheaper-preset-switches.md) · **Research:** [three.md](../research/three.md) (plan 048)

**Status when written: criteria met in the large majority, not strictly in all.** Hitch before: 70 to 350 ms. After: 14 to 40 ms, with two outliers of 37 and 45 ms over a bound of 25.6 and 38.8 ms (see "Not met").

## What was done

| Where | What |
|---|---|
| `site-meshes.ts` | vegetation sets kept per (trees, tufts) budget, built by a generator one mesh per step; `warmVegetation` (ADR 0055, point 1) |
| `planet.ts` | a new cube-map size is baked one face per frame next to the map in use and swapped when complete; a new patch size is re-baked one patch per frame, never in a frame that baked a face; a colour-map width change no longer invalidates the terrain; `marchVariantFor` |
| `renderer.ts` | `precompile` waits for the first frame (sky light in place), then compiles each preset's scene state, planet pass and march prepass, and the vessel's part materials at each preset's detail (`SceneModel.warmPartScene`); builds the vegetation sets in idle periods; no env-light re-capture on a switch |
| `post.ts` | the post chain is kept built and shrunk to a pixel on `low` instead of disposed (its bloom and output programs stay compiled) |
| `environment.ts` | the shadow map follows a new size three frames after the switch (a 4096 map costs 30 to 36 ms to allocate); a map that does not exist yet is allocated at once |
| `presets.ts` | `low.envSize` 64 to 128 (see surprises) |
| `test/preset-switch.test.ts` | 10 tests: warmed set equals a directly built one, back-and-forth builds nothing, partial warm-up still shows a full site, detail cut-off reaches kept sets, progressive bake (6 faces then swap, mid-bake change, map-width change does not re-bake, site change bakes at once), part warm scene, shadow-map delay |

## Method

Production build (`NODE_ENV=development vite build` so the `__orbital` hook exists), copied to the scratchpad and served by a 15-line Bun static server on port 5206 (immune to other sessions' rebuilds), built-in browser pane (hidden), canvas forced to 1920 x 1080 at ratio 1, rAF stubbed, auto quality off, the page loaded 50 s before measuring (precompile and the idle warm-ups finished). `hitch` = the `setPreset` call plus the first frame, or the longest later frame of the next 2 s (a frame = `debug.benchmark(1)` after a 16 ms sleep, so GPU included). Bound = 4x the steady frame of the target (minimum of 30 windows of 8 frames): low 25.6, medium 38.8 to 39.6, high 49.6 to 50 ms. Another session's tab shares the GPU, which showed as occasional 90 ms frames in the middle of a run; every number below is from a run, including the bad ones.

## Hitch tables (ms)

Before (build of the tree at the start of the session, cold page, first visits then revisits):

| switch | setPreset | first frame | hitch | bound |
|---|---|---|---|---|
| high to low | 20.3 | 329.5 | **349.8** | 27 |
| low to medium | 107.3 | 71.1 | **178.4** | 40 |
| medium to high | 162.2 | 46.9 | **209.1** | 50 |
| high to medium | 34.5 | 36.3 | **70.8** | 40 |
| medium to low | 17.4 | 29.0 | **46.4** | 27 |
| low to high | 222.3 | 60.7 | **283.0** | 50 |

After (final code, cold page): high to low 16.5, low to medium 22.5, medium to high 23.5 (first visits). Then 28 more switches in all orders: 26 within the bound, 2 over: `medium` 39.7 against 38.8 and `low` 37.1 against 25.6 (the same pair measured again six times in a row gave 16 to 18). Typical: to low 14 to 19, to medium 18 to 26, to high 26 to 38. The steady frames did not move: high 12.3, medium 9.8, low 6.4 ms (before 12.4, 9.9, 6.8).

Governor ladder steps (preset and render scale changed together, as `applyLevel` does): high@0.85 32.7, high@0.7 23.7, medium@1 28.7, medium@0.85 27.1, medium@0.7 21.6, low@1 **29.1** (bound 25.6), low@0.85 21.0, medium@1 **44.7** (bound 38.8), high@1 48.3. The ladder is not driven by the real frame loop here (rAF is stubbed); `applyLevel` is `setPreset` plus `setRenderScale`, which is what the table runs.

## What surprised me

- **The compile was the biggest part of the first visits, and the precompile was compiling the wrong programs.** `precompile` ran before the first frame: the hemisphere light was still visible and the environment map not set, so every program it made had a different cache key (light counts, env map mode) from the one a real frame needs; the planet-pass "variant" never matched (diffed the cache keys of the live programs: `numHemiLights` and `numDirLightShadows` differed), and the march prepass and the part materials of other presets were not compiled at all. A first switch to `low` created 14 programs in its first frame (115 ms). Fixed by compiling after the first frame, per preset state, and the march prepass without lights.
- Disposing the post chain on `low` freed the bloom programs; going back compiled 26 programs (125 ms to 1.5 s on one run). Kept built, shrunk to 1 x 1.
- `envSize` 64 on `low` meant a new cube-UV size in the program key: every standard material recompiled when the sky light was re-captured (80 to 230 ms) and the capture was not cheaper at 64 (11 to 16 ms against 5 to 6). `low` now uses 128; there is no re-capture on a switch.
- The 4096 shadow map allocation is 30 to 36 ms in the next frame whatever else happens.
- Pixel comparison of the pad at `low`, `medium`, `high` (1920 x 1080, camera `pad-morning`, 150 frames after each switch): mean absolute difference 10 to 14 of 255 raw, because the ground and grass detail move with time (wind, clouds) and the sim clock differed; blurred (Gaussian 12 px) over the ground band 0.7 to 0.9 of 255, mean colour within 0.4. Before and after of `high`: `assets/048-pad-high-before.jpg`, `assets/048-pad-high-after.jpg`. The per-preset instance counts and matrices of the vegetation are pinned by a unit test (warmed set equals a built one).

## Not met / follow-ups

- The 4x bound is not strict: 2 of 28 manual switches and 2 of 9 ladder steps were over it by at most 11 ms (1.45x the bound at worst, `low` 37 ms). Candidates not done: allocate the post chain's targets over frames when leaving `low`, keep the shadow map resident on `low` (64 MB), and build the part models of every preset's detail ahead (the 3 programs that `medium` still created on its first visit before `warmPartScene` landed).
- A page that starts on `low` has no post chain until the first switch up: that switch compiles the bloom and output programs once.
- The governor's real frame loop in a visible pane was not run (hidden pane, rAF stubbed): the step is the same two calls.
- M1/M2, Intel and phones not measured (draft 038, draft 050).

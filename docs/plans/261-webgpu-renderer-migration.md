---
id: 261
title: "WebGPU renderer: TSL shaders with the WebGL2 fallback, compute bakes, upscaling, a LUT sky, temporal clouds and an ultra preset"
status: in-progress
owner: "Worker D"
depends: [251, 252, 253]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 261 — WebGPU renderer: TSL shaders with the WebGL2 fallback, compute bakes, upscaling, a LUT sky, temporal clouds and an ultra preset

**Size:** XL × many. One plan in ten phases, about 60–100 agent hours (see Estimate).

## Owner's rules for this plan (2026-10-20)

1. **Quality first, not speed of release.** A release with poor performance makes players leave and not come back. This plan may delay the public release; that is accepted.
2. **Its own branch, always.** All work happens on one long-lived branch, `gfx/261-webgpu`, never on `main`. `main` keeps today's WebGL renderer as the default for the whole life of the plan. The branch takes `main` in regularly (rebase or merge from `main`, never the other way) so gameplay plans keep landing.
3. **Behind a switch until the end.** On the branch the new renderer is chosen with a development switch (`?renderer=webgpu`, or Settings → Graphics → Renderer in debug mode). The old renderer stays selectable on the branch, so every scene can be compared side by side.
4. **Manual test before merge.** The plan is merged into `main` only after the owner has run the manual checklist (Phase 9) on the M5, and on the M2 if possible, and signed it off in this plan's Log. Until then the plan stays `in-progress` (or `blocked` waiting for the owner), whatever CI says.
5. **Decision gate after Phase 0.** If the spike's numbers do not justify the move, stop. Record why in the Log and journal, and keep the WebGL path with research phases 2–4 (`refs/graphics-performance/06`) instead.

## Goal

The game looks more realistic than today and runs smoother than today on the same machines:
- **MacBook Pro M5, built-in Retina display, a new `ultra` preset:** p95 frame interval ≤ 16.7 ms at the pad, 3 km, 12 km and orbit.
- **The M2, `medium`:** a locked 30 fps or better.

The way there is three.js's WebGPU renderer (`WebGPURenderer`) with every shader written in TSL. The same TSL runs on the WebGPU backend and, where a browser has no WebGPU, on its WebGL2 backend. The renderer's compute shaders let the expensive work be computed once and reused instead of being redone per pixel per frame:
- the sky as look-up tables;
- noise as 3D textures;
- terrain bakes;
- clouds amortised over frames.

The saved time is then spent on more realism.

## Context

**Research.** `refs/graphics-performance/` (README, 01 diagnosis, 04 techniques, 05 WebGPU, 06 plan and cost, 07 the M5 baseline). Phases 0–1 shipped in plans 251–253 (ADR 0233, 0234). The October 2026 update in the session that wrote this plan found:

- **Upscalers are built in, WebGPU only.** three.js r186 has `FSR1Node` (AMD FSR 1 upscale and sharpen), `TAAUNode` (temporal upscaling) and `TRAANode` as TSL nodes; they are not available to `WebGLRenderer`. The `FSR1Node` docs say it only pays off when the fragment shader is the bottleneck, which is our case. ([three.js FSR1Node](https://threejs.org/docs/pages/FSR1Node.html))
- **A LUT sky exists for three.js.** `pmndrs/sky` (MIT) implements Hillaire's EGSR 2020 sky and atmosphere in TSL on `WebGPURenderer`, three ≥ 0.186.
  - It is correct from the ground to orbit, with presets for Earth, Mars and Titan.
  - The sky is baked only when something changes; a pixel costs "a handful of texture lookups".
  - It is young (about 11 stars), so it is a reference and a possible starting point, not a dependency we rely on. ([pmndrs/sky](https://github.com/pmndrs/sky))
- **takram three-geospatial** has a multiple-scattering LUT; its WebGPU rewrite of the atmosphere is done and the clouds are in progress. ([three-geospatial](https://github.com/takram-design-engineering/three-geospatial))
- **Browsers.** WebGPU is on by default in Safari 26, Chrome and Firefox on Apple Silicon Macs. Without it, `WebGPURenderer` falls back once, at `init()`, to its WebGL2 backend.
- **WebGPU is not automatically faster.** An r173 test of 20 000 non-instanced cubes ran slower than `WebGLRenderer` (per-object uniform buffers). The gains come from compute, fewer per-pixel operations and instancing. Our draw count is modest (trees and tufts are instanced), so the per-object overhead should not dominate. Phase 0 measures it.

**What has to be ported** (counted 2026-10-19, research 01 §5 and 05):
- **Shaders:** about 3 170 lines of GLSL in template strings.
  - `planet.glsl.ts` 1 500, `moon.glsl.ts` 454, `terrain.glsl.ts` 332;
  - effects 267, atmosphere and noise 168, aurora, march, sky-env, cloud field, upsample, site steam, ground glow, weathering, VAB highlight.
  - `ShaderMaterial` in 12 files.
  - `onBeforeCompile` patches in `weathering.ts` and `moon.ts` (part and moon materials).
- **Pipeline:** `EffectComposer` + `UnrealBloomPass` + `OutputPass` (`post.ts`) becomes a TSL `RenderPipeline`.
- **Render targets:** the terrain bake renders cube faces one by one into a `WebGLCubeRenderTarget`; there are MSAA `WebGLRenderTarget`s.
- **WebGL-only calls:**
  - `readPixels` in `debug.benchmark` and the parity checks;
  - the `WEBGL_debug_renderer_info` GPU name;
  - the `EXT_color_buffer_float` and `OES_texture_float_linear` checks (WebGPU needs `float32-filterable` for the RGBA32F patches; a manual bilinear fallback exists).
- **Shader details:**
  - the planet pass samples three's shadow map as `sampler2DShadow`;
  - it writes `gl_FragDepth` with three's log-depth constants;
  - it uses `#include` chunks;
  - it calls `dFdx` and `dFdy` inside non-uniform branches, which WGSL's uniformity analysis rejects unless the diagnostic is turned off.
- **Not touched:** the simulation (ADR 0003: sim and renderer are separate). Only `packages/renderer` and its wiring in `apps/web` change.

**ADRs.**
- Written: [0246](../decisions/0246-webgpu-renderer-backend.md), the renderer backend (the decision gate). It supersedes ADR 0027's WebGL-only pipeline where it differs, once the branch merges.
- To revisit: 0053 (budget and governor), 0064 (half planet pass), 0086, 0087, 0233, 0234.

## Scope

**In:**
- the WebGPU renderer and TSL ports of every shader;
- the WebGL2 fallback through the same TSL;
- compute bakes;
- upscaling;
- a Hillaire LUT sky;
- 3D noise textures;
- temporal clouds;
- the governor on GPU time;
- an `ultra` preset;
- parity and performance tests;
- the manual test.

**Out:**
- **Gameplay and simulation changes.**
- **New art content** beyond what the new techniques need.
- **Removing the old `WebGLRenderer` code path from the repository.** That is a follow-up plan after this one has been on `main` for a while. When this plan merges, the old path stays in the code as a fallback switch for one release.

## Touches

- **Edits:**
  - `packages/renderer/**` (all shaders, passes, post, presets, governor);
  - `apps/web/src/lib/graphics.ts`, `apps/web/src/lib/flight-loop.ts` (renderer choice, GPU timing);
  - the Debug panel (renderer and GPU time rows);
  - `apps/web/scripts/measure-graphics.ts` and `capture-graphics.ts`;
  - `apps/web/e2e/*` (the renderer switch);
  - `docs/architecture/rendering*.md`.
- **Shared contracts:** the `Renderer` interface of `@orbital/renderer` stays the same for the web app. Mod visuals (`PartVisual`, generators) keep their data format; a mod's own custom shader, if any, needs a TSL version (to be announced in the mod guide).

## Steps

### Phase 0 — Spike and decision gate (about 4–6 h)

1. Create the branch `gfx/261-webgpu` from `main`. Add the `?renderer=webgpu` switch: `WebGPURenderer` with `await renderer.init()`, `forceWebGL` for the fallback test.
2. Port the smallest end-to-end slice to TSL: the sky and atmosphere part of the planet pass (`atmosphere.glsl.ts`) on a fullscreen node, plus the output pass. Everything else draws as today, or is left out of the spike scene.
3. Measure with `measure-graphics.ts` (plan 251's method), WebGL against WebGPU on the same scene:
   - the M5 and the M2;
   - Chrome and Safari 26;
   - pixel ratio 1 and 2;
   - GPU time from WebGPU timestamp queries where available.
4. **Gate.** Go on when the WebGPU slice is at least as fast as the WebGL one at Retina on both machines, the fallback (`forceWebGL`) renders the same image, and nothing blocks the rest of the port (uniformity diagnostics, float32 filtering, shadow sampling). Otherwise stop (rule 5). Write the backend ADR either way.

### Phase 1 — Foundation (about 6–10 h)

5. Choose the backend in one place: `createRenderer` picks `WebGPURenderer`, or the old path with the switch. Device lost and context lost are handled.
6. Post-processing as a TSL `RenderPipeline`: scene pass, bloom node, tone mapping and output. Antialiasing strategy: MSAA where it is cheap on Apple GPUs' tile memory, else the temporal node of Phase 5.
7. Debug and measurement: replace `readPixels` timing with GPU timestamp queries (fall back to the frame interval in Safari when timestamps are missing). Use the WebGPU adapter info for the GPU name. Show the renderer and GPU time in Debug → Info.
8. Shader warm-up: `compileAsync` of every pipeline behind the loading screen, with progress. On WebGPU it no longer blocks rendering (r184).

### Phase 2 — The planet pass in TSL (about 12–20 h)

9. Port the planet pass piece by piece, each with a screenshot comparison against the old renderer:
   - atmosphere;
   - terrain refine march and root finding;
   - the silhouette;
   - ground surface and lighting;
   - sea, rivers and waves;
   - cumulus and cirrus;
   - light shafts;
   - aurora;
   - stars;
   - cloud and terrain shadows.
10. The half-size pass, the depth-aware upsample and the edge pass, with the pixel budget of ADR 0234.
11. Depth: decide between reversed depth and logarithmic depth in TSL (ADR). Keep the vessel, the site and the planet pass in one depth space.

### Phase 3 — Bakes on compute (about 4–8 h)

12. Terrain cube faces and the camera patches as compute passes (storage textures). Keep the float32-filterable feature check with the manual bilinear fallback.
13. The cloud coverage map and the smoke noise as compute bakes.

### Phase 4 — Everything else in TSL (about 8–14 h)

14. Moons (their terrain, shadows and stones).
15. Effects: plumes, smoke, explosions, site steam, ground glow, splash and dust.
16. Part materials: weathering (`onBeforeCompile` becomes `NodeMaterial`), VAB highlight, Hangar and Space Center site meshes, building models.
17. Shadow map sampling in the new pipeline. Plan 201's flicker fix and ADR 0234's 2048 map at Retina keep holding.

### Phase 5 — Upscaling (about 2–4 h)

18. Replace the half rung's bilinear upsample with `FSR1Node` (sharpness tuned on the five capture views). Optionally use `TAAUNode` for the whole frame once mesh motion vectors exist.
19. Re-tune the pixel budget with the sharper upscale: the Space Center view should get back its crispness (the owner's complaint after plan 252).

### Phase 6 — The LUT sky (about 4–7 h)

20. Hillaire's four LUTs (transmittance, multiple scattering, sky-view, aerial perspective) as compute passes, rebuilt only when the sun, the camera's altitude band or the atmosphere change. Ray march above the top of the atmosphere, as the paper and `pmndrs/sky` do.
21. Evaluate `pmndrs/sky` as a base. Adopt it only if it fits our planet frame, our bodies and our licence rules; otherwise port its approach.
22. Clouds and terrain read the aerial-perspective volume instead of the per-pixel march.

### Phase 7 — Noise textures and temporal clouds (about 8–14 h)

23. Tiling 3D noise textures baked by compute: Perlin-Worley shape and Worley detail. They replace the hash noise in the clouds, the cirrus, the cloud shadows and, where the look holds, the ground octaves.
24. Temporal clouds:
    - march 1/4 or 1/16 of the pixels each frame;
    - reproject the history with the camera;
    - fall back to full tracing on cuts, warp changes, map toggles and fast motion;
    - fade to a cheaper shell from orbit.
25. Optionally fold the light shafts into the aerial-perspective volume or march them at a lower resolution with the same history.

### Phase 8 — Governor and `ultra` (about 3–5 h)

26. The governor (ADR 0233) reads GPU time where timestamp queries exist, and the frame interval elsewhere.
27. The `ultra` preset spends the saved time on realism: more cloud steps and detail, finer terrain, shafts, shadows, aurora. Re-measure every preset on the M5 and the M2 at Retina. Update `selectPreset` per device and pixel ratio.

### Phase 9 — Verification, manual test, merge (about 4–6 h, plus the owner's time)

28. The full e2e suite passes with the WebGPU renderer (Chromium and WebKit), and again with `forceWebGL` (the fallback).
29. Parity screenshots of the capture views, old against new, within the thresholds below; deliberate improvements are listed with before and after images in the journal.
30. **Manual test by the owner** (checklist below), on the M5 and, if possible, the M2. Sign-off in the Log.
31. Merge into `main` with WebGPU as the default and the old renderer behind the switch for one release. Then file the follow-up plan that removes the old path.

## Acceptance criteria

**Performance** (production build, plugged in, governor on, `measure-graphics.ts`):
- [ ] **MacBook Pro M5, built-in display at its default resolution, `ultra`:** p95 frame interval ≤ 16.7 ms at the pad, 3 km, 12 km and orbit, and frames over 33.3 ms < 0.5 % in a two-minute free flight.
- [ ] **The M5, `high`:** sync frame time at least 25 % below plan 252's numbers (16.5 / 15.1 / 16.8 / 9.9 ms) at the same four scenes.
- [ ] **The M2 13", `medium` at Retina:** p95 ≤ 33.3 ms (a locked 30 fps or better).
- [ ] **Loading:** the time to the first flight frame, with the shader warm-up behind the loading screen, is no more than 20 % longer than today's on the M5. There is no hitch over 100 ms after the first frame.

**Parity:**
- [ ] `capture-graphics.ts` before and after:
  - pad noon, pad low sun, 12 km and orbit differ in at most 5 % of pixels by more than 16/255, outside the deliberate improvements listed in the journal;
  - the Space Center view is at least as sharp as before plan 252 (owner's look check).

**Correctness:**
- [ ] The full e2e suite passes in Chromium and WebKit on the WebGPU renderer, and in Chromium with `forceWebGL`.
- [ ] `bun test packages/renderer` passes with tests for the LUT rebuild triggers, the temporal fallback on cuts and warp, the upscaler's budget maths and the backend choice.
- [ ] No GLSL `ShaderMaterial` and no `onBeforeCompile` is left in `packages/renderer/src`, enforced by a test that scans for them (the old path's files are excluded while it exists).
- [ ] `bun run typecheck`, `bun run build`, `bun run docs:check` pass. CI is green on the branch's `ready/261` tag.

**Manual** (the owner's sign-off, required before merge):
- [ ] `[manual]` The checklist below is done on the M5 (and the M2 if available) and signed in the Log.

### Manual test checklist (owner)

Run the production build of the branch, with the WebGPU renderer, in Chrome and in Safari on the M5:
1. **Launch to orbit on `ultra`:** liftoff, max-Q, staging, the cloud deck from below, through and above, a sunset on the way up, orbit. Smooth? Any stutter, flicker, ghosting behind the vessel or on the clouds?
2. **The Space Center from above:** the ground, the river, the buildings sharp; the build menu and labels as before.
3. **Reentry and landing:** plasma, heat glow, chute, touchdown, dust; then EVA on the ground at dusk.
4. **The Moon:** landing near a crater rim, shadows, the horizon from the surface.
5. **The map view and time warp at high levels:** no smearing when switching views or warping.
6. **The Hangar:** parts, lights and highlights look right.
7. **The fallback:** the same flight with `?renderer=webgpu&forceWebGL=1` (or a browser without WebGPU) still renders correctly, slower but playable.
8. **The M2 on `medium`:** a launch to orbit is playable.
9. **The overall verdict:** is it more realistic than `main` today, and does it feel smoother?

## Risks

| Risk | Mitigation |
|---|---|
| WebGPU slower for our draw pattern | Phase 0 gate measures it first; stop if it is |
| A shader that cannot be expressed in TSL or WGSL (uniformity, derivatives in branches, shadow sampling) | Phase 0 ports the hardest-looking piece first; uniformity diagnostics off where three.js allows; restructure branches |
| Look drift during the port | Screenshot parity per piece (Phase 2); the old renderer stays switchable on the branch |
| The branch falls far behind `main` | Take `main` in at least weekly; gameplay plans keep landing on `main` |
| Temporal ghosting on launches, warp and map switches | Full-trace fallback on cuts; the manual checklist's items 1 and 5 |
| Safari quirks (timestamps, float32 filtering) | Frame-interval governor fallback; manual bilinear fallback; Safari in the manual test |
| Bundle size (both backends) | Measure; lazy-load what only one backend needs |
| A young dependency (`pmndrs/sky`) | Reference first; adopt only if it fits (Phase 6, step 21) |

## Estimate

Agent hours by the roadmap's sizes (S ≈ 0.75 h, M ≈ 1.25 h, L ≈ 2.25 h, XL ≈ 4 h), plus look checks and measurement:

| Phase | Hours |
|---|---|
| 0 spike and gate | 4–6 |
| 1 foundation | 6–10 |
| 2 planet pass | 12–20 |
| 3 compute bakes | 4–8 |
| 4 everything else | 8–14 |
| 5 upscaling | 2–4 |
| 6 LUT sky | 4–7 |
| 7 noise and temporal clouds | 8–14 |
| 8 governor and ultra | 3–5 |
| 9 verification and merge | 4–6 |
| **Total** | **≈ 55–95 h** |

Phases 2 to 7 all edit the planet shaders, so they run mostly in sequence. Phase 4 can run beside Phases 5–7 in a second worktree of the same branch. Plus the owner's manual test (about 1–2 h) and the owner's look checks along the way.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, open issues).
- [ ] `docs/journal/261-webgpu-renderer-migration.md` written, with the Phase 0 numbers, the parity images and the final measurements.
- [ ] The backend ADR (Phase 0), the depth ADR (Phase 2) and the sky ADR (Phase 6) written and linked.
- [ ] `docs/architecture/` rendering docs updated; `docs/guides/writing-a-mod.md` says how a mod's custom shader moves to TSL.
- [ ] `refs/graphics-performance/` gets the results as a new section.

## Log

- 2026-10-21 — Worker D (M2): `main` carries "**Dropped by the owner** (\"untuk 261 atau 232 udah drop aja itu mah\")" from another session (commit 9d7993cd), while in this session the owner asked to carry on through every phase and merge once sure. The branch keeps going; nothing is merged to `main` until the owner says which holds. ADR 0242 became 0246 (0242 to 0245 were taken on `main` meanwhile).
- 2026-10-21 — The owner: "sekarang lanjutkan terus sampai selesai yah, sampai semua fase terlewati, commit lalu push" and "dan kalau sudah yakin langsung merge aja ke main". The owner's manual test before merge (rule 2) is replaced by this word: the branch merges once it is verified, and `main` keeps WebGL as its default (`?renderer=webgpu` opts in), so the merge changes nothing for a player who does not ask for it.
- 2026-10-21 — Worker D (M2): **Phase 2 step 10 done, Phase 2 complete.** The march prepass, the half-size pass, the depth-aware upsample and the edge pass in TSL. One graph builds four materials (full, half with the depth in alpha, edge with the non-edge pixels discarded, prepass), and the upsample draws in the full pass's place. The scale is the governor's rung under the pixel budget (ADR 0234, `budgetScale`); `setPlanetScale` and `halfPlanetAvailable` now reach it. On the M2's Retina display (2880 × 1800), `high`, governor off, the frame interval went from 50 / 83 / 67 / 17 ms to **18 / 33 / 33 / 17 ms** (pad, low sun, 12 km, orbit). WebGL's is 100 / 150 / 100 / 34 ms. The WebGL2 fallback holds 33 ms and draws the same image.
- 2026-10-21 — Worker D (M2): **Phase 2, slice 2c**: clouds, water, light shafts and aurora on WebGPU. `tsl/clouds.ts` has the cumulus field, slab, erosion, cirrus and the cloud-map bake. `tsl/water.ts` has the waves, swash and surf, ripples and the river field. `tsl/planet-pass.ts` gets the lakes, shore waves, rivers with their flow, foam, wave caps, ripple normals, floodlights, cloud shadows from the map, the cumulus march and the cirrus layer composited at their distances, the shafts' second march (clouds and terrain), and the aurora. The air in front of a cloud is marched once with snapshots at the layers (`lut-sky.ts` `march`, the twin of `marchAtmosphere`). Pad, low sun and 12 km match WebGL's band brightness within about 10 %, and a cloud layer seen from 3 km and the sea's waves look alike. The aurora is untested on screen (no view with it lit). Three r186's WebGPU shadow node does not survive `castShadow` going off, so the WebGPU facade keeps it on while the preset has shadows. The frame interval holds 16.7 ms on the M2 (WebGL `high`: 50 to 83 ms). Left in Phase 2: the march prepass and the half-size pass (step 10).
- 2026-10-21 — Worker D (M2): **Phase 2, slice 2b**: the terrain on WebGPU. `tsl/terrain.ts` bakes core's height function into a six-face atlas with gutters and into the two camera patches. It uses `PlanetPass.terrainJobs`, `markCubeBaked` and `markPatchBaked`, so the CPU still plans the bakes. The gradient is a forward difference until the compute bakes of Phase 3. `tsl/planet-pass.ts` marches it with the GLSL's steps, crest look-ahead, Illinois root finding and silhouette parabola, and has the hill relief and slope normals, rock, alpine and snow by height and slope, the grazing fix, the terrain's shadow, the vessel's and the site's shadow from three's shadow map, and the air in front of terrain marched with the tables (ADR 0246 point 9). Pad, low sun, 12 km and orbit match WebGL within about 10 % in brightness; WebGPU and its WebGL2 fallback have no console errors. On the M2 at 1280 × 800, `high`, the frame interval holds 16.7 ms where WebGL's is 50 to 83 ms. This is not yet a fair comparison: clouds, water detail, shafts and aurora (2c) are still missing.
- 2026-10-21 — Worker D (M2): **Phase 2, slice 2a**: the planet pass in TSL (`tsl/planet-pass.ts`, `tsl/lut-sky.ts`, `tsl/noise.ts`), drawn in the GLSL pass's place from the uniforms the GLSL pass keeps. It covers the sea-level sphere: the LUT sky, the ground from the biome map with its coast warp and detail octaves, the launch site's paving, sun and sky light, sea glint, the stars and the sun's disc, and three's logarithmic depth (ADR 0246 point 7). The pad, a low sun, 12 km and orbit look like WebGL on the M2 with no console errors. Still to come: 2b, the terrain (bake, march, relief, the vessel's shadow), and 2c, the water detail, clouds, shafts and aurora.
- 2026-10-20 — Worker D (M2): **Phase 1 done** (steps 5–8). `createRenderer` takes `?renderer=webgpu` / `webgpu-fallback` (`backend.ts`) to `renderer-webgpu.ts`. It is the same `SceneModel` behind the shared half of the facade (`renderer-facade.ts`, which the WebGL facade now uses too). The post chain is a TSL `RenderPipeline` (scene pass with the preset's MSAA, `BloomNode`, ACES and sRGB as the output transform). GPU time comes from timestamp queries, the GPU name from the adapter, and both show in Debug → Info. `benchmarkAsync` waits for the queue. Warm-up uses `compileAsync`. A lost device or context builds a new renderer (at most 3 times). GLSL meshes are hidden each frame and listed in Debug → Info as "Not drawn yet" (`webgpu-compat.ts`, ADR 0246 point 5). On the M2 the flight runs with no console errors on both backends: the vessel, tower, buildings, vegetation and shadows draw; the planet, ground and sky wait for Phase 2.
- 2026-10-20 — Worker D (M2): at the owner's choice, Phase 6 step 20 ran next as a spike, before Phases 1–5, so there is something to look at early. `webgpu-spike/lut-sky.ts`: Hillaire's transmittance (256 × 64), multiple-scattering (32 × 32) and sky-view (192 × 108, rebuilt every frame) tables in TSL, on the same air. On the M2 in Chromium at pixel ratio 2, the sky costs **0.78 ms instead of 4.58** (pad), with real multiple scattering in place of the 2.2 boost; the tables bake in 8–15 ms once. The fallback is as fast and draws the same image. With 8 noise octaves (the clouds' stand-in) 9.11 → 5.08 ms: the rest is the noise, Phase 7's job. Aerial perspective (the fourth table) and the pmndrs/sky evaluation (step 21) are still open. Data `refs/graphics-performance/data/m2-spike-261-lut-chromium.json`.
- 2026-10-20 — Worker D (M2): the owner ran the matrix in Safari 26 on the M2 (`refs/graphics-performance/data/m2-spike-261-safari.json`): WebGPU 0–4 % behind WebGL (pixel ratio 2, 8 octaves, pad: 9.7 / 9.9 / fallback 9.5 ms), inside Safari's 0.1 ms timer step. The owner chose to skip the M5 for the gate. **Gate passed:** parity on both browsers, the same image, nothing blocking. Backend ADR 0246.
- 2026-10-20 — Worker D (M2): Phase 0 steps 1–3 on the M2 in Chromium. A TSL port of the atmosphere march (`packages/renderer/src/webgpu-spike/`, page `/dev/webgpu-spike`) draws the same image as the GLSL one on all three backends. Its cost is the same within ±5 % (pixel ratio 2, 8 noise octaves, pad: WebGL 8.90 ms, WebGPU 8.78, fallback 8.82). Data in `refs/graphics-performance/data/m2-spike-261-chromium.json`. A plain port gives parity, not a gain, as the plan expects; the gain has to come from Phases 3–5. The gate still needs the M5 and Safari 26 numbers (the same page), then the backend ADR.
- 2026-10-20 — Worker D (M2): claimed at the owner's word ("gas mulai sekarang"); branch `gfx/261-webgpu`. Phase 0 (spike) first.
- 2026-10-20 — Created at the owner's request after the graphics research (`refs/graphics-performance/`) and its October 2026 update: quality first, its own branch, manual test before merge.
- 2026-10-21 — **Dropped by the owner** ("untuk 261 atau 232 udah drop aja itu mah"). Work already merged stays on main; nothing more is done under this plan.

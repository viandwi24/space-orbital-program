# 04 — Techniques, and what each means for us

Each section gives the technique, its evidence and costs, then **For us**, tagged Adopt / Improve / Avoid, with the files it would touch and a size:
- **S** about 0.75 h of agent time;
- **M** about 1.25 h;
- **L** about 2.25 h;
- **XL** about 4 h or more.

These are the roadmap's planning sizes. Sources are listed in [00](00-sources.md).

## 1. Resolution: a pixel budget and upscaling

**Evidence:**
- Cost follows pixels almost linearly ([02](02-measurements.md)).
- AMD FSR 1 is spatial only: EASU upscales, RCAS sharpens. It costs at most 0.2–0.5 ms at 1440p on mid-range PC GPUs. Its modes scale each axis by 1.3× (Ultra Quality) to 2× (Performance). It needs anti-aliased input and must run after tone mapping [S13].
- three.js has `TAAUNode` and `TRAANode` (temporal upsampling and reprojection) only as TSL nodes, that is in the WebGPURenderer pipeline [S15, S16]. `TAARenderPass` (WebGL) has no reprojection and only works for a still camera [S17].
- No maintained WebGL FSR1 port was found.
- Teleoperator caps its pixel ratio at 1.75 ([03](03-how-others-do-it.md) §1).

**For us:**
- **Adopt: a pixel budget for the planet pass instead of a pixel-ratio cap.**
  - Keep the canvas, the meshes and the HUD at the display ratio. Draw the planet pass at about 2.1–2.5 Mpx: the half rung's machinery (`half-res.ts`, `upsample.glsl.ts`, the edge pass) with a target size instead of a fixed ½.
  - Measured: the half planet pass alone removes 65 % at ratio 2 on the M2.
  - Files: `presets.ts` (`planetPixelBudget`), `renderer.ts:234-251`, `planet.ts:893-924`, `quality-governor.ts`. **M.**
- **Improve: an FSR1-style EASU + RCAS upsample** in GLSL, in place of the bilinear depth-aware upsample, to keep edges sharp at 0.5–0.67 scale. `upsample.glsl.ts`, `planet.ts`. **M** (EASU on WebGL2 without `textureGather`: 12 taps).
- **Later: TAAU** once a history buffer exists (§4). It needs motion vectors for meshes; **L**, or free with WebGPU's `TAAUNode`.

## 2. The sky: Hillaire LUTs

**Evidence (Hillaire 2020, EGSR [S1], read in full):**
- The method uses four LUTs:
  - transmittance 256×64;
  - multi-scattering 32×32;
  - sky-view 200×100, lat/long with a non-linear latitude;
  - aerial perspective, 32×32 froxels × 32 slices over 32 km.
- **Cost on a GTX 1080:**
  - building the LUTs: 0.01 + 0.07 + 0.05 + 0.04 ms;
  - the on-screen sky and aerial perspective: **0.14 ms**;
  - the whole thing at 720p: 0.31 ms.
- **Cost on an iPhone 6s:** about 1 ms for Fortnite's whole sky.
- **From space** the sky-view LUT wastes texels on empty space, so the paper switches to direct ray marching there; the planet and atmosphere then cost 0.33 ms.
- **Volumetric shadows** (mountains or clouds onto the haze, i.e. our shafts) need a per-pixel march again: 32 samples, sky 1.0 ms. The paper suggests lower resolution plus temporal reprojection.
- **Implementations:** Unreal (reference), Bevy (defaults: sky-view 400×200 with 16 samples, aerial 32³ with 10 samples) [S3, S4]. A WGSL/three.js r184 version re-bakes the sky-view every frame [S8].

**For us:**
- **Adopt** sky-view + multi-scattering + aerial-perspective LUTs. We already have the transmittance table (`planet.ts:107-131`).
  - The planet pass reads the sky from the sky-view LUT, and haze over terrain and clouds from the aerial volume (the cloud snapshots `insA`/`insB` become volume lookups).
  - Keep the direct march above a chosen altitude, as the paper does.
  - Shafts: keep their march, but at the planet pass's budgeted resolution, or fold cloud shadowing into the aerial volume (Improve).
- **Size:**
  - **L** for the LUT passes and the planet-pass changes;
  - **+M** for look development: before/after screenshots at the pad, sunset, 12 km and orbit, since ADR 0027's look must survive.
  - Needs an ADR superseding ADR 0027 point "no Bruneton LUTs".
  - Files: `atmosphere.glsl.ts`, `planet.glsl.ts:1400-1425`, `planet.ts`, `environment-light.ts` (the IBL capture can read the LUT too).
- **Expected:** the 12-sample march per pixel goes away from most of the screen. Sky cost becomes nearly independent of resolution *(inferred from the paper's numbers)*.

## 3. Clouds: amortise, and cheaper noise

**Evidence:**
- **Horizon Zero Dawn:** a 2 ms budget. It updates one pixel in each 4×4 tile per frame, with 16 frames of latency, and looks full resolution [S9, S2].
- **Frostbite (Bauer 2019):** quarter-resolution tracing plus TAA upsampling; instant, but softer [S2].
- **Nubis Evolved:** later work added handling for fast-moving clouds, where reprojection struggles [S10].
- **takram three-clouds:** with the 1/16 march, 92–95 fps against 31 fps (M3 Max, 4K) [S5].
- **A Nubis-style WebGPU implementation:** 1.1–2.0 ms on an M1, with 128³ + 32³ noise textures, at half resolution [S8].

**For us:**
- **Adopt first, without temporal machinery: a 3D noise texture.**
  - Replace hashed value noise (8 `pcg3d` hashes per call) with one trilinear fetch of a tiling 3D noise texture (128³ R8 is 2 MB), with the quintic curve applied to the coordinate.
  - Applies to the cumulus erosion and coverage, the cirrus, the cloud shadow and possibly the ground octaves.
  - Files: `atmosphere.glsl.ts` (`noiseF`, `noiseF3`), `cloud-field.glsl.ts`, a texture builder.
  - **M–L.** The look shifts slightly (tiling period), so it needs a visual check.
- **Adopt: cloud shadows on `high` from the baked map**, as `medium` already does.
  - Measured +0.1 ms instead of +1.0–1.2 ms at 1080p; edges get softer.
  - `presets.ts` (`cloudShadowMap: true`, `cloudShadowOctaves: 0`). **S.**
- **Adopt, later: temporal clouds.**
  - March the cumulus at ¼ or 1/16 of the pixels into a cloud buffer. Reproject the history with the camera matrices; clouds are far away, so camera motion dominates.
  - Fall back to quarter-resolution tracing when the camera cuts or moves fast: launches, warp, map view.
  - Fade to a cheaper shell from orbit.
  - Needs a history buffer and a frame index in the jitter (there is none; ADR 0064 defers it).
  - **XL** (6–10 h with tuning). Expected: cloud cost ÷3 or more.

## 4. Temporal accumulation in general

**For us — Improve.** Once a history buffer exists (§3), the same machinery serves several effects:
- TAA in place of 4× MSAA on the planet pass;
- shaft and aurora marches at lower resolution;
- TAAU for the whole planet pass.

Mesh motion vectors are the expensive part. The planet pass needs none: its motion comes from the camera alone. Start with the planet pass only.

## 5. Bandwidth on Apple GPUs (TBDR)

**Evidence (Apple, WWDC20 [S28]):**
- The GPU has no video memory, so bandwidth is the limit.
- MSAA is cheap in tile memory, and its resolve happens from tile memory.
- Load and store only the attachments you need.
- Hidden-surface removal is pixel-perfect, but only if fragments do not write depth themselves.
- 16-bit formats halve bandwidth.

**For us:**
- **Adopt** at ratio ≥ 2:
  - `msaa` 2 on `high`;
  - a non-MSAA second composer target instead of a cloned 4× one;
  - `antialias: false` on the canvas while the post chain is on.
  - Files: `post.ts`, `renderer.ts:213`, `presets.ts`. **S.** The saving is unmeasured.
- **Improve: reversed-Z instead of logarithmic depth.**
  - three r186 has `reversedDepthBuffer` (needs `EXT_clip_control`; check Chrome and Safari on Metal first).
  - Log depth makes every three material write `gl_FragDepth`, which defeats early-Z and HSR for 2000 trees, 28000 tufts, the site and the vessel *(inferred)*.
  - Files: `renderer.ts`, `planet.glsl.ts:1580-1586`, `upsample.glsl.ts`, `moon.glsl.ts`. **M.**
- **Adopt:** keep RGBA16F everywhere it is enough. The patches use RGBA32F, which is needed for heights.

## 6. Shadows and periodic spikes

- **Adopt:**
  - a 2048 shadow map at ratio ≥ 2 on `high`, or re-render it only when the casters or the sun move;
  - spread the PMREM recapture over several frames (5–6 ms spikes during ascent, journal 048).
  - Files: `presets.ts`, `environment.ts:369-406`, `environment-light.ts`. **S + S.**
- **Avoid** cascades for cost reasons: they add passes. three r186's `SunLight` with CSM [S18] is WebGPU-side anyway.

## 7. Terrain march

The prepass already runs at 1/16 resolution. At Retina the refine march (40 steps) rides on the pixel budget (§1).

**Improve** later: refine steps by footprint, so distant pixels take fewer steps. `planet.glsl.ts:273-375`. **S–M.**

## 8. Frame pacing and the governor

**Evidence:**
- **Pacing:** 45 fps on a 60 Hz display holds frames alternately 16.7 and 33.3 ms, a visible judder; a locked 30 is smoother [S44b].
- **Valve's adaptive quality** [S44]:
  - aim at 70–90 % GPU use;
  - drop 2 levels at once when a frame takes over 90 % of the budget;
  - raise 1 level only after 3 frames under 70 %;
  - predict by extrapolation;
  - step the resolution scale (0.65–1.4).
- **Browser timers:**
  - WebGPU `timestamp-query` is quantised to 100 µs in Chrome;
  - `EXT_disjoint_timer_query_webgl2` is available on about 81 % of Chrome and almost no Safari or Firefox [S24–S27].
- **Display rate:**
  - Safari keeps rAF near 60 Hz on ProMotion by default [S30];
  - iOS Low Power Mode throttles rAF to 30 fps deliberately [S29].

**For us — Adopt** (overlaps release plan 201; coordinate there):
- **The budget.** Know the pixel ratio and the display cadence. Target 60 (16.7 ms), or a locked 30 as the fallback, never floating at 40–55. Detect a 30 Hz throttle and do not fight it.
- **The ladder.** Move the **planet pixel budget** first and features last, so "ultra" keeps its look. Step down fast (2 rungs), step up slowly. Cap changes per second.
- **Retries.** After a failed trial, stay down until the scene changes: altitude band, view, preset. Do not retry on a timer alone.
- **Start.** Start Retina displays on the budgeted rung, not on full ratio 2.
- **GPU timer.** Use `EXT_disjoint_timer_query_webgl2` as a hint where it reads sanely (Chrome); fall back to frame intervals in Safari.
- Files: `quality-governor.ts`, `flight-loop.ts:698-707`, `graphics.ts`, `presets.ts`. **M.**

## 9. Measurement tools (needed before any of the above)

- **Adopt:**
  - `measure-devices.ts` options for viewport, scale factor and pixel ratio (the throwaway variant of [02](02-measurements.md));
  - debug switches that turn single features off for ablation: clouds, shafts, aurora, cloud shadow, terrain shadow, tufts, shadow map, bloom;
  - a frame-time histogram in the Debug panel: p50, p95, p99 and the share of frames over 16.7 ms.
  - **M.** Without it, every later phase is judged by feel.

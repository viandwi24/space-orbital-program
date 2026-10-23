# 02 — Reaching 120 fps in a browser: what others do, and what applies to us

Research only, 2026-10-24. This adds to `refs/graphics-performance/` (03, 04, 05, 07), `docs/research/frame-budget-and-efficiency.md` and `docs/research/shader-compile-windows.md`, and does not repeat them. Sources are listed at the end as [Bn].

## 0. Where we stand, and what 120 fps means

- **M5 at Retina, `high`, 1.75 Mpx planet budget:** 16.5 / 15.1 / 16.8 / 9.9 ms sync at the pad / 3 km / 12 km / orbit (07 §4). At 120 Hz the budget is **8.33 ms**, so we need about **2×** at the pad and 12 km, and about 1.2× in orbit.
- **Frame-rate ceiling.** rAF follows the display, so 120 Hz on the M5 in Chrome (repo measurement). Nothing above 120 fps is visible on this panel, so "100–150 fps" really means **a locked 120**. Frames come at multiples of the vsync: 120, 60, 40, 30. An 8.5 ms frame shows as 16.7 ms. A "100 fps" average is a judder between 120 and 60, not a smooth 100. The goal is **GPU ≤ ~6.5–7 ms and main thread ≤ ~6 ms**, leaving room for the compositor.
- **Safari** still renders pages at about 60 fps on ProMotion by default. The flag "Prefer Page Rendering Updates near 60fps" changes that, and players will not change it [B1, B2]. So the 120 Hz target applies to Chrome and Edge. In Safari, aim for a locked 60.
- **The cost we cannot see.** On the M2 at Retina, `high` reads 6–9 ms of GPU timestamps but 33 ms frame intervals. The difference is the frame's end: resolve, present and the canvas copy at 5.7 Mpx (ADR 0248). Timestamps do not cover it. **Any plan for 120 fps has to make the presented and resolved surfaces smaller, not only the planet march cheaper.**

## 1. Frame pacing in the browser

| Technique | Gain | Cost / risk | For us |
|---|---|---|---|
| **Lock-aware targets.** Aim for 120 or 60, never in between; target 85 % of the vsync period (Valve's adaptive quality, 04 §8) | Removes the 120/60 judder. A missed 8.3 ms frame costs a full extra 8.3 ms | Low | Governor (plan 253 line): the budget is 7 ms at 120 Hz. Change the internal resolution first, never the preset in flight (switch stalls of 1.5–3 s, research §3) |
| **rAF timestamp, not `performance.now()`**, for the simulation step and for detecting the vsync period | Stable motion at 120 and 60 | None | Probably done; check that the cadence detector reads 8.33 ms periods |
| **Long Animation Frames API** (`PerformanceObserver` type `long-animation-frame`): script attribution and `renderStart` / `styleAndLayoutStart` per frame [B3] | Finds main-thread hitches over 50 ms (GC, layout, HUD) in the field. Chrome 123+ only | Low, diagnostics only | Add to the load and flight report |
| **Keep GC out of the frame.** No allocation on the hot path; HUD at 30 Hz | Major-GC spikes take one or two 120 Hz frames | Medium (HUD code) | The HUD makes 1.2 MB a frame of garbage (research §2). At 120 Hz that doubles to 140 MB/s. Throttle navball and HUD updates to 30–60 Hz, decoupled from the render |
| **OffscreenCanvas renderer in a worker** [B4] | The main thread (DOM HUD, input) can no longer delay the render | High: three's WebGPURenderer works on an OffscreenCanvas, but the scene, the input and the snapshot transport all have to move. The three.js forum reports jank remaining from other main-thread work [B4] | **Later.** At 3.6–5.2 ms of main thread per frame (M2) it only becomes binding at 120 Hz. Do the cheaper cuts first |
| `requestVideoFrameCallback` | None: it fires for a `<video>` element's frames [B5] | — | Not relevant |
| **Battery state.** Chrome's Energy Saver throttles animation below 20 % battery or when unplugged [B6] | Avoids a governor that sinks quality | Low | Done (30 Hz throttle check). Default the limit to 60 on battery |

## 2. WebGPU practices

| Technique | Gain | Cost / risk | For us |
|---|---|---|---|
| **Render bundles** (three: `BundleGroup`, `static`, `needsUpdate` [B7]; Babylon's snapshot rendering records whole frames [B8]; Toji [B9]) | CPU only: encoding and validation happen once. Babylon says the gain "can be quite large" on the JS side and that GPU time stays the same [B8] | Static contents only. Lights cannot be in the group. A rebuild costs more than a plain draw [B7, B9] | **The static site** (pad buildings, dishes, rocks, tree cells). It complements plan 367's `BatchedMesh`. CPU gain matters only once we target 120 Hz |
| **Bind groups by update rate** (frame / pass / material), created once, dynamic offsets [B10] | Less JS and validation per draw | three handles this internally | Avoid per-object uniform churn (the r173 slowdown, 05) |
| **Pipeline warm-up.** `compileAsync` with every target and sample-count variant | No hitch on a quality switch | Done for presets (plan 362 / 370) | Extend it to every internal-resolution rung if a rung builds new targets |
| **Timestamp queries.** `trackTimestamp: true` at construction; results are per render context (`getTimestamp(uid)`); the pool defaults to 256 queries [B11] | Per-pass GPU ms | Chrome quantises to 100 µs. They miss the frame end on Apple GPUs (ADR 0248) | Give each pass its own context so the planet, clouds, post and bloom can be timed separately |
| **Indirect draws:** all arguments in **one** buffer. On D3D12, 412 separate indirect buffers cost about 3 ms of validation, against about 10 µs in one buffer [B12] | Matters on Windows | — | Rule for any GPU-driven terrain or culling (§3) |
| **Compute for bakes** (noise volumes, LUTs, terrain patches, culling) | The work happens once, not per pixel per frame | WebGPU only: the WebGL2 fallback has no compute (05) | The noise 3D textures (04 §3) and the CDLOD patches. Keep a render-pass bake for the fallback |
| **No readbacks in the frame** (`mapAsync` only on a ring of staging buffers, a few frames late) | Avoids stalling the GPU pipeline | — | Check the benchmark and parity paths. Nothing in the flight loop should read back |
| **Xcode Metal capture of Chrome** (`--enable-dawn-features=use_user_defined_labels_in_backend`, `MTL_CAPTURE_ENABLED=1`; label objects; `pushDebugGroup`) [B13] | The only way to see load/store actions, bandwidth and the resolve and present cost on the M5 | Fragile: a debuggable Chrome; the browser hangs after each capture | **Do this first** (plan 368): it measures the unseen frame end |

### Apple TBDR specifics

- **Load and store only what you need.** Depth and MSAA colour should use `storeOp: "discard"`, with the resolve done in the same pass through `resolveTarget`. The samples then stay in tile memory and only the resolved pixels are written [B14, WWDC20 S28 in 00].
- **`TRANSIENT_ATTACHMENT`** (Chrome 146, February 2026) is WebGPU's equivalent of memoryless: an attachment needed only inside one pass stays in tile memory and may get no VRAM allocation [B15]. Candidates: the MSAA colour, and any depth we do not sample later. three r186 does not set it, so we would need a small backend patch or an upstream PR. **Gain:** bandwidth and memory, with the most effect at 5.7 Mpx. *(Inference: about 46–92 MB less traffic per frame at Retina for one RGBA16F MSAA 2× target.)*
- **MSAA on WebGPU is cheap when resolved in-pass.** It is expensive when a cloned multisampled target is loaded again in a later pass. Dawn's `ExpandResolveTexture` load op exists for this case [B14]. If we move to TAAU, MSAA must be off anyway [B16].
- **Fewer full-screen passes.** Each pass writes and reads 5.7 Mpx × 8 bytes, about 46 MB. Merge tone mapping, grading, upscale-sharpen and the output into one pass. Run bloom's chain from a ¼ size source. Use `rg11b10ufloat` where alpha is not needed (half of RGBA16F).

## 3. Planet rendering at scale

| Technique | Gain | Cost / risk | For us |
|---|---|---|---|
| **Temporal upscaling of the whole 3D image** (three `TAAUNode`: jittered input below output resolution, depth and velocity, 9-tap Blackman-Harris resolve, `currentFrameWeight` 0.025, MSAA off [B16]; `PassNode.setResolutionScale`) | It is TAA and upscaling in one pass. Render about 0.55–0.65 of the side (1.7–2.4 Mpx of 5.7) and present full Retina sharpness. It also replaces MSAA, which takes 1.9–3.9 ms (07 §2) | Needs velocity for meshes (vessel, site), ghosting on thin geometry, and disocclusion tuning. WebGPU path only | **The highest-value change.** The planet pass's motion is camera-only. Vessels need velocity output (TSL `velocity` MRT) |
| **FSR 1** (three `FSR1Node`: EASU 12 taps, RCAS 5 taps, `sharpness` 0.2; use it only when fragment-bound, and on an anti-aliased input [B17]) | A spatial upscale with no history, so no ghosting. AMD: 0.2–0.5 ms at 1440p (04 §1) | Softer than TAAU at 0.5 scale. Needs AA input | Fallback for the WebGL2 path and for cuts (warp, map, launch) where history is invalid. Also replaces our bilinear depth-aware upsample of the planet pass |
| **Dynamic resolution at a fixed maximum target** (render into a sub-rectangle by viewport, or a resolution scale, and do not reallocate) [B18] | Governor steps cost nothing: no reallocation, no new pipelines | Upscaler UVs must use the active rectangle | three r186 keys pipelines by target object, not size (research §3), so `setResolutionScale` is already safe. Prefer small steps: 0.5–0.75 of the side |
| **Clouds: 1/16 temporal march** (takram three-clouds: M3 Max at 4K, `high`, **92–95 fps with temporal upscaling against 31 without**; M2 Ultra 60 against 29–31; ghosting and smearing are known issues; GLSL only, WebGPU planned [B19, B20]). HZD: half resolution plus a 4×4 update pattern [B21]. Cinevva (WebGPU, TSL): half-resolution Nubis clouds plus sky at **1.1–2.0 ms on an M1**, 128³ Perlin-Worley and 32³ Worley textures baked by compute at boot [B22] | About 3× on the cloud term. The cloud cost no longer follows the pixel count | History buffer, and a fallback on camera cuts (04 §3, XL) | Once TAAU's history and jitter exist, clouds can share the jitter sequence. ADR 0248 holds it until a measurement shows clouds holding the frame; at 120 Hz they will |
| **Noise in textures** (compute-baked 3D noise) [B22] | Removes 8 hash calls per noise octave per sample | Tiling, so a look check | Unchanged from 04 §3. At 120 Hz it moves up the list |
| **GPU-driven CDLOD.** A compute shader walks the quadtree and atomically appends visible patches to one indirect draw. Per-vertex morph, 33×33 grid, heights in a 16-layer RGBA16F virtual atlas with a page table generated by compute on demand; **about 140–160 fps at 1280×800 on an M-series GPU** [B23]. A three r186 + TSL landscape: CDLOD with 100–450 patches in one instanced draw, compute culling of trees, a sun-shadow and AO bake re-run only when the sun moves; **3–6 ms of GPU time (worst case 10–15 ms) at 1600×900, 4× MSAA, on a base M4** [B24]. Pinson's sample does the quadtree in compute with indirect dispatch and draw [B25] | Rasterised near terrain gets early-Z and HSR on TBDR, so its cost no longer grows with march steps. It also gives real geometric silhouettes and parallax | XL. Seams on the cube-sphere and precision near the surface (camera-relative patches) | **The big structural option.** It would replace the per-pixel terrain refine march (40 steps) near the ground, where the pad and 3 km frames are the most expensive. Keep the march for far terrain and orbit, where it is already cheap |
| **Virtual texturing and streaming** [B23]: page table, LRU on the CPU, compute fill | Bounded memory for detail textures | High | Only if the terrain moves to CDLOD. Until then the 20–164 MB atlases of plan 364 hold |
| **KTX2 / Basis** transcoded to ASTC on Apple (three's `KTX2Loader`, worker pool; ETC1S to ETC1 is "basically free", call `init()` early) [B26] | GPU-compressed textures: 4–8× less memory and bandwidth than RGBA8 (vendor claim) [B27] | Encode step in the asset pipeline. Banding in ETC1S on smooth gradients | Earth albedo and normals (plan 364). Bandwidth is the TBDR limit, so it helps frame time, not only load time |
| **Atmosphere LUTs** (Hillaire) | Done in plan 261. Cinevva rebuilds the sky-view each frame and the transmittance only when the sun moves [B22] | — | Move the LUT builds to compute when convenient. No further frame gain expected |

## 4. What the reference apps measure on Apple silicon

| App | Setting | Measured | Lesson |
|---|---|---|---|
| takram three-clouds [B19] | M3 Max, 4K, Chrome | 92–95 fps (temporal) / 31 (none) | Temporal clouds are the 3× lever |
| Cinevva open-world, part 22 [B22] | M1, WebGPU | Sky + clouds 1.1–2.0 ms, over 100 fps | Half-resolution clouds with compute-baked noise fit a 120 Hz budget |
| Taos mountain sample [B23] | M-series, 1280×800 | 140–160 fps | GPU-driven CDLOD in WebGPU is cheap |
| webgpu-landscape-rendering [B24] | Base M4, 1600×900, 4× MSAA | 3–6 ms GPU (10–15 worst) | three r186 + TSL + compute culling reaches 120-class budgets at about 1.4 Mpx |
| Teleoperator (03) | Our pane | 58 fps, 1.75 ratio cap | Resolution cap and baking |
| Unity 6 WebGPU [B28] | Mac mini M4 Pro, Edge | Unlit cubes: **twice the frame time of WebGL**; 24 % CPU in bind-group updates | WebGPU is not faster by default. Driver-side overhead has to be avoided by design |
| ICS Media, three WebGPU vs WebGL [B29] | — | At 10,000 draws: WebGL about 30 fps, WebGPU about 50 fps; WebGL ahead on simple instanced scenes | WebGPU's gain is in many draws and in compute |

**What these share** *(inference)*: every one that runs at 120-class rates on Apple silicon draws **about 1–2.5 Mpx of expensive shading**. They amortise volumetrics over frames, and they bake anything that does not change every frame. None of them shades 5.7 Mpx per frame at full cost.

## 5. Ranked: the 10 highest-value changes for 120 fps on the M5, with better visuals

Gains are estimates from the measurements above, for the pad or 12 km at Retina `high` on WebGPU.

1. **Render the 3D image at about 0.6 of the side and reconstruct it with TAAU; turn MSAA off.** TAAU replaces our MSAA 2× and the bilinear planet upsample. The canvas stays at Retina for sharpness. Expected: −40 to −55 % of GPU work, plus the MSAA resolve (07: msaa −1.9 ms, pixels about 70 % of the frame), with better edge AA than MSAA 2×. Use FSR 1 when the history is invalid, and in the WebGL2 path. **L–XL.**
2. **Measure the frame end on the M5 with an Xcode Metal capture** (labels and debug groups) [B13]: load/store actions, resolve, present, and the number of full-screen passes. This tells whether item 1 or item 4 holds the frame. **S–M.** Plan 368.
3. **A governor built for 120 Hz.** Budget of 7 ms GPU and a lock target (120, otherwise a locked 60). Its only fast axis is the TAAU input scale (0.5–0.75), with no reallocation. Per-context timestamps as evidence, scaled by the measured intervals. **M.**
4. **TBDR pass hygiene.** Discard depth and MSAA stores, resolve in the same pass, `TRANSIENT_ATTACHMENT` where three allows it [B15], one merged final pass (tone map, grade, sharpen, output), bloom from ¼ size, `rg11b10ufloat` targets. Expected: 1–3 ms at Retina *(inference from 46 MB per full-screen RGBA16F pass)*. **M.**
5. **Temporal clouds** that share TAAU's jitter and history: 1/16 or ¼ march, with a fallback on cuts [B19, B21]. Expected: about 3× on the cloud term [B19]. It also allows more steps and a detail octave, so a better look. **XL.**
6. **Compute-baked 3D noise** (128³ base and 32³ detail) for clouds, cloud shadows and ground octaves [B22]. It cheapens every per-pixel noise call, and that matters most before item 5 lands. **M–L.**
7. **CPU at 120 Hz.** The HUD at 30–60 Hz, decoupled from the render, with no allocation on its path. `BundleGroup` for the static site [B7], `BatchedMesh` for vessels (plan 367), binary snapshots (plan 365). Watch it with Long Animation Frames [B3]. Goal: main thread ≤ 4 ms per frame. **M.**
8. **GPU-driven CDLOD terrain near the surface** on the cube-sphere (compute quadtree, one indirect buffer, morphing) [B23, B24, B12]. It replaces the refine march under about 20 km, with real silhouettes and early-Z. This is the structural fix for the pad and 3 km frames, and the largest visual gain for terrain. **XL** (ADR first).
9. **KTX2 / ASTC for every large texture** (Earth albedo, normals, site, parts) [B26]: less bandwidth per sample and less memory. **M**, with plan 364.
10. **OffscreenCanvas rendering in a worker** [B4], only if items 7's cuts leave the main thread over budget at 120 Hz. It isolates the render from DOM and GC hitches on the main thread. **XL.**

Not recommended: chasing render bundles for GPU gains (they are CPU-only [B8, B9]); expecting WebGPU alone to be faster (Unity M4 Pro, [B28]); targeting 100 fps averages on a 120 Hz panel (judder; §0).

## Sources (all accessed 2026-10-24)

- [B1] iphonesoft.fr, enabling 120 Hz in Safari (2026-01-26) — https://iphonesoft.fr/2026/01/26/activer-defilement-fluide-120-hz-safari-mac-ipad-iphone
- [B2] WebKit bug 294338 (the 60 fps flag; Safari only, not WKWebView) — https://bugs.webkit.org/show_bug.cgi?id=294338 (snippet)
- [B3] Chrome for Developers, Long Animation Frames API — https://developer.chrome.com/docs/web-platform/long-animation-frames
- [B4] three.js manual, OffscreenCanvas — https://threejs.org/manual/en/offscreencanvas ; forum "OffscreenCanvas still janks main thread" — https://discourse.threejs.org/t/offscreencanvas-still-janks-main-thread/52148 (snippets)
- [B5] MDN, `HTMLVideoElement.requestVideoFrameCallback()` — https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- [B6] 9to5Google, Chrome Memory and Energy Saver — https://9to5google.com/2022/12/08/google-chrome-memory-energy-saver/ (snippet)
- [B7] three.js docs, BundleGroup — https://threejs.org/docs/pages/BundleGroup.html
- [B8] Babylon.js docs, WebGPU snapshot rendering — https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering
- [B9] Toji, WebGPU render bundle best practices — https://toji.dev/webgpu-best-practices/render-bundles
- [B10] wgpu docs, dos and don'ts — https://wgpu.rs/doc/wgpu/documentation/best_practices/dos_and_donts/index.html ; gpuweb issue 915 — https://github.com/gpuweb/gpuweb/issues/915 (snippets)
- [B11] three.js docs, WebGPUTimestampQueryPool / TimestampQueryPool — https://threejs.org/docs/pages/WebGPUTimestampQueryPool.html ; forum r173 timestamps — https://discourse.threejs.org/t/r173-resolve-timestamps-error-message/77370 (snippets)
- [B12] Toji, indirect draw best practices — https://toji.dev/webgpu-best-practices/indirect-draws
- [B13] Toji, profiling Chrome WebGPU with Xcode — https://toji.dev/webgpu-profiling/xcode
- [B14] Dawn, load-resolve texture feature — https://dawn.googlesource.com/dawn.git/+/chromium/6594/docs/dawn/features/dawn_load_resolve_texture.md (snippet)
- [B15] Chrome for Developers, New in WebGPU 146 (transient attachments) — https://developer.chrome.com/blog/new-in-webgpu-146 ; Intent to Ship — https://groups.google.com/a/chromium.org/g/blink-dev/c/nejekzLzk74
- [B16] three.js docs, TAAUNode — https://threejs.org/docs/pages/TAAUNode.html
- [B17] three.js docs, FSR1Node — https://threejs.org/docs/pages/FSR1Node.html
- [B18] gamedev.net, Dynamic resolution rendering — https://gamedev.net/tutorials/programming/graphics/dynamic-resolution-rendering-r2821 (snippet)
- [B19] takram three-geospatial, clouds package README — https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/clouds
- [B20] takram, three-geospatial project page (WebGPU status) — https://www.takram.com/projects/three-geospatial (snippet)
- [B21] Bowles et al., Optimisations for real-time volumetric cloudscapes (arXiv 1609.05344) — https://arxiv.org/pdf/1609.05344 (snippet)
- [B22] Cinevva, open world in the browser, part 22: clouds and meshlets — https://app.cinevva.com/blog/2026-05-07-open-world-browser-part-22-clouds-and-meshlets
- [B23] Taos engine, mountain terrain deep dive — https://taosengine.com/book/samples/mountain_fox.html
- [B24] vvanghelue, webgpu-landscape-rendering — https://github.com/vvanghelue/webgpu-landscape-rendering
- [B25] Cedric Pinson, webgpu-quadtree-compute-shader — https://github.com/cedricpinson/webgpu-quadtree-compute-shader (snippet)
- [B26] three.js docs, KTX2Loader — https://threejs.org/docs/pages/KTX2Loader.html ; forum "KTX loading seems to take too long" — https://discourse.threejs.org/t/ktx-loading-seems-to-take-too-long/35873 (snippets)
- [B27] Cinevva KTX2 compressor (vendor claim of 4–8×) — https://app.cinevva.com/tools/ktx2-compressor (snippet)
- [B28] Unity forum, high frame cost in Unity 6 WebGPU vs WebGL — https://discussions.unity.com/t/unexpected-high-frame-cost-in-unity-6-webgpu-vs-webgl-questions-on-bindgroup/1653892 (snippet)
- [B29] ICS Media, getting started with three.js on WebGPU — https://ics.media/en/entry/250501/ (snippet)
- Repo: `refs/graphics-performance/03, 04, 05, 07, 00` (S28 = Apple WWDC20 TBDR), `docs/research/frame-budget-and-efficiency.md`, ADR 0248.

**Open gaps:** I found no primary source on how Chromium paces WebGPU canvases on ProMotion; the 120 Hz rAF figure comes from our own M5 measurement. There are no published per-pass Apple numbers for the resolve and present cost. Nobody has measured TAAU's own cost on Apple GPUs: measure it on the M5.

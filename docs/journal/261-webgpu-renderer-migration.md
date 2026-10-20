# 261 — WebGPU renderer (Phase 0 spike, Phase 6 sky spike, Phase 1)

**Plan:** [plans/261-webgpu-renderer-migration.md](../plans/261-webgpu-renderer-migration.md) · **Session:** Worker D (MacBook Pro M2 13"), 2026-10-20 · **Branch:** `gfx/261-webgpu` · **ADRs:** [0242](../decisions/0242-webgpu-renderer-backend.md)

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/webgpu-spike/sky-spike.ts` | The atmosphere march (Rayleigh, Mie, ozone, sun-depth LUT, pcg3d noise octaves) twice: the existing GLSL on `WebGLRenderer`, and a TSL port on `WebGPURenderer` (WebGPU, or `forceWebGL` for the fallback). A benchmark that waits for the GPU on each frame |
| `apps/web/src/routes/dev/webgpu-spike` | A dev page: backend, noise octaves, pixel ratio, view (pad, 12 km, orbit), one measurement or the whole matrix, JSON out |
| `refs/graphics-performance/data/m2-spike-261-chromium.json` | The M2 Chromium matrix |

## Results (M2, Chromium, ms per frame, synchronous)

| Octaves | Ratio | View | WebGL | WebGPU | Fallback |
|---|---|---|---|---|---|
| 0 | 1 | pad | 1.16 | 1.10 | 1.14 |
| 0 | 2 | pad | 4.45 | 4.27 | 4.35 |
| 0 | 2 | orbit | 2.54 | 2.42 | 2.42 |
| 8 | 2 | pad | 8.90 | 8.78 | 8.82 |
| 8 | 2 | 12 km | 8.84 | 8.78 | 8.84 |
| 8 | 2 | orbit | 6.82 | 6.79 | 6.73 |

A plain port costs the same on every backend (within ±5 %). The three screenshots are identical.

## What surprised me

- **WGSL is stricter about shifts.** `vec3<u32> >> u32` does not compile; it has to be `shiftRight(uvec3(16))`. The failed pipeline drew nothing, and the first numbers (0.14 ms) looked like a miracle. The runner now counts console errors and saves a screenshot per backend.
- **`uv()` runs top-down on `WebGPURenderer`**, on both of its backends, so the first image was upside down. The TSL flips y.
- **Output colour space.** `WebGPURenderer` converts to sRGB at output by default; the GLSL writes straight to the canvas, so the spike sets `LinearSRGBColorSpace` to compare like with like.
- `waitForGPU` is gone in r186; the benchmark waits on `device.queue.onSubmittedWorkDone()` (WebGPU) or a 1-pixel `readPixels` (fallback).

## Safari 26 (M2, run by the owner)

| Octaves | Ratio | View | WebGL | WebGPU | Fallback |
|---|---|---|---|---|---|
| 0 | 2 | pad | 4.8 | 4.9 | 4.7 |
| 8 | 2 | pad | 9.7 | 9.9 | 9.5 |
| 8 | 2 | 12 km | 9.6 | 10.0 | 9.6 |
| 8 | 2 | orbit | 7.4 | 7.7 | 7.3 |

WebGPU is 0–4 % behind in Safari, which is about one step of its 0.1 ms timer. The fallback is as fast as WebGL.

## Gate

Passed. The owner skipped the M5 ("skip dulu m5 nya"). GPU timestamp queries come with Phase 1 step 7; the spike times the CPU wait.

## Phase 6 spike: the LUT sky (M2, Chromium)

The owner wanted to see something early, so the LUT sky (step 20) came before Phases 1–5, on the spike page (`webgpu-lut`, `webgpu-lut-fallback`).

| Where | What |
|---|---|
| `webgpu-spike/lut-sky.ts` | Hillaire's sky in TSL on our air (Rayleigh, the march's Mie split, ozone). Transmittance 256 × 64 with Bruneton's mapping and multiple scattering 32 × 32 (64 directions × 20 steps, ground bounce), baked once. The sky view 192 × 108 (finest at the horizon), 32 samples a texel with both tables, rebuilt every frame. The screen reads one texel; ground pixels read two transmittance texels for the view ray. Above the air the same table holds, its rays starting where they enter. The sunlight fades across the sun's disc at the terminator |
| `sky-spike.ts` | The two LUT backends and the bake time; the fallback's GPU wait now reads the canvas, not a table left bound |
| the page | Show, a bake column, a sunset view |

| ms per frame | WebGL march | WebGPU march | **WebGPU LUT** | LUT fallback |
|---|---|---|---|---|
| ratio 2, pad | 4.58 | 4.32 | **0.78** | 0.85 |
| ratio 2, sunset | 4.57 | 4.37 | **0.79** | 0.82 |
| ratio 2, 12 km | 4.54 | 4.48 | **0.77** | 0.78 |
| ratio 2, orbit | 2.57 | 2.44 | **0.64** | 0.68 |
| ratio 2, pad, 8 octaves | 9.11 | 8.88 | **5.08** | 5.10 |

The tables bake in 7–16 ms, once per atmosphere.

| | The march (today) | The LUT sky |
|---|---|---|
| pad | ![](assets/261-march-pad.jpg) | ![](assets/261-lut-pad.jpg) |
| sunset | ![](assets/261-march-sunset.jpg) | ![](assets/261-lut-sunset.jpg) |
| orbit | ![](assets/261-march-orbit.jpg) | ![](assets/261-lut-orbit.jpg) |

### What surprised me

- **Physical is darker.** The march multiplies all in-scatter by 2.2 to stand in for multiple scattering; real multiple scattering adds less overhead and more at the horizon and in twilight. The spike gives the LUT sky an exposure of 1.6 to compare like with like. The port has to calibrate the exposure with the ground, which also gets brighter by it.
- **TSL's typings lag its runtime.** Named `Loop` variables (needed for nested loops, which otherwise all get `i`) and plain numbers as nodes type-fail, so `lut-sky.ts` takes TSL untyped.
- **Table reads use `.level(0)`** (WGSL's `textureSampleLevel`) so sampling inside branches and loops raises no uniformity errors.
- The noise octaves now dominate: 8 octaves cost 4.3 ms of the 5.08. Phase 7's noise textures are the next big gain.

### Still open in Phase 6

- The aerial-perspective volume (the fourth table) for terrain and clouds (step 22).
- The pmndrs/sky evaluation (step 21).
- A rebuild only when the sun or the altitude band changes (today the sky view rebuilds every frame; it costs well under the 0.78 ms).

## Phase 1: the foundation

| Where | What |
|---|---|
| `backend.ts` | `?renderer=webgpu` and `webgpu-fallback`; anything else is WebGL |
| `renderer-facade.ts` | The half of the facade that only talks to the `SceneModel` (camera, map, site, picking, the model's debug calls), shared by both renderers; getters stay getters (`withShared`) |
| `renderer.ts` | Uses the shared half; `createRenderer` hands a WebGPU request to `renderer-webgpu.ts`; `benchmarkAsync`, and `info()` gains renderer, GPU time and the lists |
| `renderer-webgpu.ts` | `WebGPURenderer` (log depth, PCF shadows, ACES, timestamps). The TSL `RenderPipeline`: scene pass with the preset's MSAA, `BloomNode` at the preset's bloom scale with the WebGL chain's strength, radius and threshold, output transform. `compileAsync` warm-up of the scene and of the other presets' parts, then vegetation. A lost device or context rebuilds the renderer up to 3 times. The adapter's name, the texture limit |
| `webgpu-compat.ts` | Hides the GLSL meshes for the frame; lists them and the patched materials |
| Debug → Info | Renderer, GPU and GPU time; "Not drawn yet" on WebGPU |

| M2, Chromium, 1440 × 900, ratio 1 | WebGL (all of it) | WebGPU (what is ported) | Fallback |
|---|---|---|---|
| frame interval p50 (`high`) | 33.2 ms | 16.7 ms (vsync) | 16.7 ms |
| `benchmarkAsync` (`high`) | 24.6 ms | 0.47–0.59 ms | 0.42 ms |
| GPU time from timestamps | – | about 1.2–2.8 ms | – |
| console errors | 0 | 0 | 0 |

The WebGPU frame is cheap because the planet pass is not drawn yet: it is the cost, as `refs/graphics-performance/01` found. These numbers are not a comparison yet; Phase 2 makes them one.

| WebGL (today) | WebGPU after Phase 1 |
|---|---|
| ![](assets/261-phase1-webgl-high.jpg) | ![](assets/261-phase1-webgpu-high.jpg) |

### What surprised me

- **A `ShaderMaterial` is not skipped, it is replaced.** The node renderer logs "Material ShaderMaterial is not compatible" and draws a blank material, so hiding has to happen around each draw and each `compileAsync` (which collects the objects before its first `await`).
- **The timestamp pool sums up to when it is read**, not to when the read was asked for. Dividing by the frames counted at the request gave 25–50 ms for a 2 ms frame. The frames are now counted from one finished read to the next.
- **`info.render.drawCalls` reads 0 between frames**: a `compileAsync` resets it. The counts are now taken right after the facade's own draw.
- **The grass draws as plain standard material.** Its wind and colour patch is an `onBeforeCompile`, which the node renderer ignores; it is on the "drawn without its patch" list for Phase 4.

### Verification

```
cd packages/renderer && bun test                      708 pass, 0 fail
bun run check:affected                                ✓ prettier ✓ docs ✓ typecheck; web vitest 1323 passed, 2 failed (sim-host-script-worker.test.ts, the known environment failure on this machine)
bun run typecheck                                     0 errors
bun run build                                         done
headed Chromium, /flight?renderer=webgpu|webgpu-fallback, presets low, medium, high: 0 console errors; Debug → Info "webgpu · WebGPU: apple metal-3 · GPU 2.19 ms a frame"
```

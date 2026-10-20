# 261 — WebGPU renderer (Phase 0 spike)

**Plan:** [plans/261-webgpu-renderer-migration.md](../plans/261-webgpu-renderer-migration.md) · **Session:** Worker D (MacBook Pro M2 13"), 2026-10-20 · **Branch:** `gfx/261-webgpu` · **ADRs:** the backend ADR follows the gate

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

## Still open for the gate

- The M5 and Safari 26 numbers: open `/dev/webgpu-spike` and press "Run the whole matrix".
- GPU timestamp queries (Phase 1 step 7); the spike times the CPU wait.

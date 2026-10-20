# 0242 — The renderer moves to WebGPURenderer with TSL, on its own branch

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/261-webgpu-renderer-migration.md
**Supersedes on merge:** ADR 0027 where it is WebGL-only
**Builds on:** ADR 0233 and 0234 (the pixel budget and the governor), `refs/graphics-performance/` (05 WebGPU, 06 plan and cost)

## Context

The owner wants the game more realistic and smoother at the same time, before public players try it. The research found that the techniques that save the most fragment work (LUT sky, compute bakes, `FSR1Node` and `TAAUNode` upscaling) exist in three.js only for `WebGPURenderer` and TSL. Plan 261's Phase 0 ported the atmosphere march to TSL and measured it against the GLSL one on the M2 (`refs/graphics-performance/data/m2-spike-261-*.json`).

| M2, pixel ratio 2, 8 octaves, pad | WebGL | WebGPU | WebGPU's WebGL2 fallback |
|---|---|---|---|
| Chromium | 8.90 ms | 8.78 ms | 8.82 ms |
| Safari 26 | 9.7 ms | 9.9 ms | 9.5 ms |

The three images are identical.

## Decision

1. **The target renderer is `WebGPURenderer`, every shader in TSL.** A plain port costs the same as today (within ±5 % on both browsers). The gain is meant to come from what only this renderer offers (plan 261 Phases 3, 5–7), not from the backend itself.
2. **One shader source for both backends.** Where a browser has no WebGPU, the same TSL runs on the renderer's WebGL2 backend, which measured as fast as the old `WebGLRenderer`. No GLSL copy is kept beside the TSL once a piece is ported.
3. **On its own branch until the owner's manual test.** The work lives on `gfx/261-webgpu` behind `?renderer=webgpu`; `main` keeps `WebGLRenderer` until plan 261's Phase 9.
4. **The M5 numbers were not a gate condition.** The owner skipped them; Phase 8 measures the M5 against the `ultra` goal.

## Consequences

- About 3 170 lines of GLSL get rewritten. TSL has its own rules: WGSL wants vector shift amounts, and `uv()` runs top-down (see the journal).
- Until Phase 4 is done, the game under `?renderer=webgpu` draws only what is ported.
- If the later phases do not deliver the gain, the branch is not merged and `main` loses nothing.

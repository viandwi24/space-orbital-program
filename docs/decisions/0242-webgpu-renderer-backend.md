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
5. **During the port the WebGPU facade draws only what is ported (Phase 1).** `?renderer=webgpu` builds a second facade, `renderer-webgpu.ts`, on the same `SceneModel`. What only talks to the model is shared (`renderer-facade.ts`); drawing, sizing, measuring and warm-up are each renderer's own. three's node renderer cannot draw a GLSL `ShaderMaterial` (it logs an error and draws a blank material). So each frame the meshes on one are hidden and shown again after the draw, and Debug → Info lists them as what is left to port. `onBeforeCompile` patches are ignored by the node renderer, and those materials are listed apart. Each later phase shortens the list; at Phase 9 it is empty.
6. **The WebGPU renderer starts asynchronously.** `createRenderer` stays synchronous: the facade draws nothing until `await renderer.init()` has finished, and `precompile` waits for it. `benchmark` cannot wait for a WebGPU queue inside a call, so `benchmarkAsync` is the measurement on every backend.
7. **Depth stays logarithmic (Phase 2 step 11).** The TSL planet pass writes three's own logarithmic depth (`viewZToLogarithmicDepth` with the camera's near and far, what node materials write under `logarithmicDepthBuffer`), so the vessel, the site and the planet pass share one depth space as on WebGL. Reversed depth was not taken: it would change every material for no gain the spike showed.
8. **The TSL planet pass reads the GLSL pass's uniforms.** `PlanetPass.update` keeps computing the frame on the CPU (camera, sun, body rotation, ambient, exposure). `tsl/planet-pass.ts` links a TSL uniform to each of those it needs and draws in the GLSL mesh's place. The CPU side is not duplicated and stays tested, and the GLSL pass can leave the codebase without touching it.
9. **The terrain's far field is a 2D atlas of the six cube faces (Phase 2b).** Each face tile has a one-texel gutter baked from directions past its edge, so hardware filtering never mixes faces, and the lookup picks the face by hand. This avoids depending on cube render targets and their face conventions on two backends; the texel layout `(hi, lo, g1, g2)` is the cube map's. The bakes are planned by `PlanetPass` (`terrainJobs`, `markCubeBaked`, `markPatchBaked`) as before. The gradient is a forward difference of three heights until Phase 3 bakes on compute with the analytic one (ADR 0116).

## Consequences

- About 3 170 lines of GLSL get rewritten. TSL has its own rules: WGSL wants vector shift amounts, and `uv()` runs top-down (see the journal).
- Until Phase 4 is done, the game under `?renderer=webgpu` draws only what is ported.
- If the later phases do not deliver the gain, the branch is not merged and `main` loses nothing.

# 0247 — The WebGPU terrain bakes stay render passes, with the analytic gradient

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/261-webgpu-renderer-migration.md (Phase 3)
**Builds on:** ADR 0246 (the WebGPU renderer, one TSL source for both backends), ADR 0116 (the analytic gradient), ADR 0055 (bakes spread over frames)

## Context

Plan 261's Phase 3 asked for the terrain cube faces, the camera patches, the cloud map and the smoke noise as compute passes into storage textures. Three's WebGPU renderer runs compute on its WebGPU backend only. Its WebGL2 fallback, which ADR 0246 keeps for browsers without WebGPU, has no storage textures. The WebGPU port of slice 2b baked with forward differences: three heights a texel.

## Decision

1. **The bakes stay render passes** (a `QuadMesh` into a render target), so one TSL source bakes on both backends. A compute variant would be a second path for the fallback to keep in step, for no image difference.
2. **The gain is the analytic gradient.** `tsl/terrain.ts` `heightGradFn` is the twin of `terrainHeightGradGLSL` (forward mode on vec4(value, gradient), the map's derivative from its four texels): one evaluation a texel instead of three. Forward differences stay behind `debug.bakeMode(…, 'fd')` for comparison.
3. **The cloud map stays a render pass baked when the cover changes**; the smoke noise moves with the effects (Phase 4).

## Consequences

- Measured on the M2, with the mid patch read back in both modes: heights agree within 0.5 mm. The gradient differs from forward differences by 4 % on average, which is the forward differences' own error over their step. A frame that rebakes everything costs 28 ms instead of 35 (1280 × 800, `high`).
- If a later step wants work that only compute can do (a particle simulation, a GPU readback-free histogram), it adds a compute pass on the WebGPU backend with a CPU or render-pass stand-in on the fallback, and an ADR of its own.

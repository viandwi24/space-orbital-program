# 0088 — Smoke puffs read their noise from a texture

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/056-cloud-shadow-map-and-half-res-edges.md (the burning-pad item the orchestrator added after the review of plan 040)
**Builds on:** ADR 0047 (smoke as impostor billboards), 0053 (budgets).

## Context

Journal 040 measured the burning pad of the 23-part booster rocket at 23.5 to 24 ms (`high`) and 16.9 to 17.3 ms (`medium`) on HEAD, over the 16.7 / 13.3 ms budgets. Switching the smoke mesh off (A/B in one page, journal 056) took 7.5 ms off `high` (21.4 to 13.9) and 4.9 off `medium` (16.5 to 11.7): the cost is the fill of a few hundred large camera-facing sprites, each pixel evaluating four value-noise lookups (sixteen hashes) before it is blended into the multisampled target.

## Decision

1. **The noise is baked once into a tiling 256 x 256 RGBA8 texture** (`effects/smoke-noise.ts`): the shader's `vnoise` with the lattice wrapped every 16 cells, in three channels (the field at the point and at the two offsets the normal's bump used). A pixel reads two texels (mipmapped, repeat). The twin `valueNoise` is tested: it tiles, and a bilinear read of the baked texels matches the analytic noise within 0.02.
2. **Pixels with nothing to show are discarded before the lighting and the blend** (`alpha < 0.004`): the corners of the quad and the thin shoulders of the puff no longer pay for a blend into the 4x MSAA half-float target.
3. **Nothing else changes**: particle counts, sizes, colours and the lighting of the puff are as before; fire (additive) keeps its procedural noise (96 small sprites, not measured as a cost).

## Alternatives considered

- **Fewer, larger particles or preset-scaled counts:** the area on screen, not the count, is the cost; it would have changed the look of a liftoff.
- **Rendering the smoke at half resolution into its own target:** needs scene depth (the MSAA target has none to sample) and a composite; the texture got the scene under both budgets, so it was not built.
- **Lowering the opacity or the size near the camera (LOD by coverage):** changes the picture.

## Consequences

- Smoke costs 2.4 ms on `high` and 1.2 to 1.4 ms on `medium` at the burning pad (from 7.5 and 4.9): the scene reads 15.8 / 12.9 ms sync against 22.6 / 16.0 for HEAD in the same hour.
- The puff's outline differs from HEAD's in detail (the texture's linear interpolation against the quintic fade, within 0.02): the pad screenshots (`056-before-` / `056-after-burning-pad-*.jpg`) show the same smoke.
- The 256 KB texture lives as long as the effects system of a preset (a switch rebuilds it with the field).

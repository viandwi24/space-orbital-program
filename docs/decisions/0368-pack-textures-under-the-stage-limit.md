# 0368 — Textures packed so no pipeline passes 16 sampled textures

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/412-pipelines-over-16-textures.md
**Builds on:** ADR 0306 (the scaled-space bake), ADR 0342 (clouds v2), ADR 0361 (bakes of other bodies)

## Context

WebGPU allows 16 sampled textures a shader stage by default (the adapter supports 48, but the limit must be asked for and other machines differ). The planet pass's full variant sampled 16; its edge variant, drawn at the half-size pass the governor picks on a Retina display, also reads the half-size target: 17. The pipeline failed, three's shared object bind group layout went invalid, and the shadow and standard materials failed with it.

## Decision

1. **The fine and mid terrain patches are one texture**, two patches wide, the fine one on the left. Each bake sets its half as the target's viewport and does not clear (`autoClear` off for the pass); the sampler offsets u by half a texture per patch. Both nodes hold the same texture, which three binds once. Where 32-bit floats cannot be filtered the four texels are fetched by hand and clamped inside the patch's own half.
2. **The sky's transmittance and multiple-scattering tables are one texture**, 288 x 64: the transmittance (256 x 64) on the left, the scattering (now 32 x 64, from 32 x 32) on the right. Both are the same height so a viewport is a column range and the render target's y orientation does not matter. The scattering is baked into its own small target (it reads the transmittance, which lives in the pack, and a pass may not read what it writes) and copied into the pack by a pass. Every lookup is at a texel centre of its own table (`toTexel`), so linear filtering never reaches the other table.
3. **A budget of 15** (`SAMPLED_TEXTURE_BUDGET`): one under the limit. `apps/web/scripts/probe-textures.ts --gate` loads the flight page and fails above it or on any failed pipeline; it needs a GPU, so it is a pre-merge check beside `perf:gate`, not a unit test. The widest pipeline is now `planet-edge·high` with 15; the full pass has 14.
4. **Looks that add a texture to the planet pass must pack or gate it** first; the next one has no slot.

## Consequences

- The edge pass builds on a Retina display, and the shadow and standard materials with it.
- The scattering table is twice the rows (a cheap bake, once).
- The probe's per-pipeline counts are the evidence; a GPU-less count of a TSL graph's textures is not possible without a device.

# 0044 — The visual terrain follows the physical one: a precise bake and camera-centred patches

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/031-physical-terrain-and-sky-volumes.md
**Supersedes in part:** [0036](0036-visual-terrain-heights-baked-and-ray-marched.md) points 3 (the bubble) and 4 (the single cube bake); the rest of 0036 (ray-marching the baked heights, shading, self-shadows) stands.

## Context

ADR 0043 makes the height function physical. The planet pass draws it from a cube map baked at 512 to 1024 texels per face: one texel is 920 m on `high`. Measured against the analytic function (`docs/research/terrain-physical.md`, a scratch script run on 2026-10-17), bilinear interpolation of a 920 m grid is off by 13 to 27 m on average and 75 to 124 m at the worst point in the massif, 230 m texels by 1 to 2 m on average and 19 to 33 m at the worst, and 4 m texels by under a millimetre on average and 0.3 to 0.4 m at the worst point (the creases of the ridged noise). The cube also stores height in half floats: above 2 048 m the step is 2 m, above 4 096 m 4 m. A vessel resting on the physical ground would visibly sink into the drawn ground or hover above it, so the drawn ground near the camera needs centimetres, while mountains tens of kilometres away only need to be right to a pixel. Geometry clipmaps (GPU Gems 2 chapter 2) solve exactly this: nested windows of regular samples centred on the viewer, finer near, coarser far, blended near each window's edge so there is no popping; the same chapter stores the fine height in the integer part and the difference to the coarser level in the fractional part of one float, so both are read with one fetch.

## Decision

1. **Precision: height is stored as two half floats.** `hi = floor(h / 16) * 16` (exact in half floats up to 4 500 m) and `lo = h - hi` (0 to 16 m, resolution 8 mm); the shader adds them after the filtered fetch (bilinear filtering is linear, so the sum is the filtered height). The tangent gradient is stored as two numbers in the basis `(t1, t2)` that the shader derives from the direction (the bake and the pass use one function), leaving the four channels of an RGBA16F texture: `hi, lo, g1, g2`. Half-float linear filtering is core in WebGL 2 (`docs/research/terrain-physical.md`).
2. **Three levels.** The cube map (far field, as in ADR 0036) and two 2D patches in a **gnomonic projection** around a centre direction `c`: texel `(u, v)` is the direction `normalize(c + u e + v f)` with `e`, `f` the east/north-like tangent axes of `c` (the same construction as the cube's tangent basis). Patch 1 covers 4.1 km with 1024 texels at `high` (4 m), patch 2 covers 32.8 km with 1024 texels (32 m); `medium` uses 512 and 512 (8 m, 64 m), `low` uses 512 for patch 1 only. Patches are baked from the same height function as the cube (the bake shader is one source), the gradient from forward differences at half a texel.
3. **Re-centring.** The patches centre on the camera's ground direction. A patch is re-baked, centred on the camera's current ground direction rounded to a 64 m lattice of the sphere, when the camera leaves the inner 35 % of its span. Above 40 km altitude the patches are unused (and not baked). A rebake is one fullscreen pass per patch, a few hundred microseconds to a few milliseconds on the GPUs we measured; the pass keeps drawing the old patch for the frame the bake is queued in (the bake runs at the top of the frame, so there is no frame without data).
4. **Sampling.** `terrainAt(p)` fetches the cube, then blends in patch 2 and patch 1 where the point is inside their window: weight `1 - smoothstep(0.7, 1.0, max(|u|, |v|))` in window coordinates, so the surface is continuous across the window edge and a re-bake changes the surface by the interpolation difference of two levels (centimetres inside patch 1, a metre or two at the edge of patch 2, tens of metres at the edge of the cube blend at 16 km distance, which is a pixel or two there). A fetch is skipped when the weight is zero.
5. **Camera clamp.** The environment computes the camera's terrain height in float64 with the core function and, if the camera is within 1 m of the ground or below it, moves it up along the radial. The old bubble (which melted relief toward a low camera) is deleted from the model, the shader and the tests.
6. **Flat zone skip stays**: rays inside the launch site's flat disc are not marched.
7. **Shaders keep taking constants from the TypeScript table.** The shape, the soft-abs epsilon, the coast detail and the patch geometry constants all come from `core` / `terrain-patch.ts`; a test compares the generated GLSL text with the values.

## Alternatives considered

- **Raise the cube resolution.** Matching 4 m would take 150 000 texels per face. No.
- **Analytic evaluation in the march near the camera.** About 90 hash evaluations per step, 15 steps, 2 million pixels: far past the budget of ADR 0025, and impossible on the integrated GPUs.
- **A tessellated mesh (clipmap) instead of marching.** Needs seams, vertex precision under the floating origin and a depth-correct join with the analytic atmosphere (ADR 0036 argued the same). The nested 2D patches here are the clipmap's *data* without its mesh: the planet pass and its exact log depth stay.
- **32-bit float patches.** 16 bytes per texel, `EXT_color_buffer_float` plus `OES_texture_float_linear` (not core in WebGL 2) or manual bilinear; the hi/lo pair is 8 bytes and filters in hardware.
- **Snap patch centres to a texel lattice and shift contents (toroidal update).** Saves bake cost, but the function is analytic and a bake is cheap, so full re-bakes at a coarse lattice are simpler and cannot accumulate error.
- **One patch.** Its edge would pop by the whole cube error (tens of metres) at a kilometre; with two patches the visible edge difference is a few pixels at most.

## Consequences

- Memory: patch 1 and 2 at `high` are 8 MB each; the cube's channel layout changes (still 6 x 1024^2 x 8 B = 50 MB at `high`).
- The planet pass gains up to two fetches per terrain sample near the camera; the measured frame cost is in journal 031.
- The terrain is exact where a vessel can touch it (patch 1 within 2 km) and approximate where it is only looked at.
- GLSL float32 positions give about 2 cm of positional error; the in-browser readback in journal 031 states the measured maximum.

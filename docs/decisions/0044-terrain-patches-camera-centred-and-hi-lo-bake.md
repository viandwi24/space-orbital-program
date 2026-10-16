# 0044 — The visual terrain follows the physical one: a precise bake and camera-centred patches

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/031-physical-terrain-and-sky-volumes.md
**Supersedes in part:** [0036](0036-visual-terrain-heights-baked-and-ray-marched.md) points 3 (the bubble) and 4 (the single cube bake); the rest of 0036 (ray-marching the baked heights, shading, self-shadows) stands.

## Context

ADR 0043 makes the height function physical. The planet pass draws it from a cube map baked at 512 to 1024 texels per face: one texel is 920 m on `high`. Measured against the analytic function (`docs/research/terrain-physical.md`, a scratch script run on 2026-10-17), bilinear interpolation of a 920 m grid is off by 13 to 27 m on average and 75 to 124 m at the worst point in the massif, 230 m texels by 1 to 2 m on average and 19 to 33 m at the worst, and 4 m texels by under a millimetre on average and 0.3 to 0.4 m at the worst point (the creases of the ridged noise). The cube also stores height in half floats: above 2 048 m the step is 2 m, above 4 096 m 4 m. A vessel resting on the physical ground would visibly sink into the drawn ground or hover above it, so the drawn ground near the camera needs centimetres, while mountains tens of kilometres away only need to be right to a pixel. Geometry clipmaps (GPU Gems 2 chapter 2) solve exactly this: nested windows of regular samples centred on the viewer, finer near, coarser far, blended near each window's edge so there is no popping; the same chapter stores the fine height in the integer part and the difference to the coarser level in the fractional part of one float, so both are read with one fetch.

## Decision

1. **The cube map keeps the far field, now precise to the half-float limit.** Height is stored as two half floats, `hi = floor(h / 16) * 16` and `lo = h - hi` (exact up to 4 500 m, 8 mm resolution), and the tangent gradient as two numbers in the basis `(t1, t2)` that the shader derives from the direction (`terrainTangent1`), leaving the four channels of an RGBA16F texture: `hi, lo, g1, g2`. Half-float linear filtering is core in WebGL 2. The shader reads the baked height with a **single** filtered fetch and the gradient magnitude as `length(g1, g2)` (the basis is orthonormal), so the march never decodes a direction.
2. **Two camera-centred patches in 32-bit floats.** Filtering `hi`/`lo` in half precision loses up to 0.5 m near 900 m (found in the first browser run as contour-line cracks every 16 m), so the patches are `RGBA32F` render targets holding `(h, g1, g2)` filtered either by the hardware (`OES_texture_float_linear`, present on the M5 and most desktop GPUs; a uniform tells the shader) or by four `texelFetch` and a bilinear mix by hand. A patch is a **gnomonic** window around a unit direction `c`: texel `(u, v)` is `normalize(c + halfTan (u e + v f))` with `e`, `f` the tangent basis of `c`. The fine patch covers 4 096 m (4 m texels on `high`, 8 m on `medium` and `low`); the mid patch 32 768 m (32 m, 64 m, 64 m). Both are baked from the one height function (`terrain.glsl.ts`, `terrainPatchFragment`; the pure geometry is `terrain-patch.ts`).
3. **Re-centring.** A patch is re-baked, centred on the camera's ground direction snapped to a 64 m lattice, when the camera leaves the inner 35 % of its half span, and is unused above 40 km altitude. Bake cost is one fullscreen pass per patch.
4. **Sampling** (`terrainH` for the march and shadows, `terrainAt` for the one shaded hit): inside the fine patch's weight-1 core (0.7 of its half span) nothing else is read; at the edge the fine patch is blended into the mid patch and the mid into the cube with `1 - smoothstep(0.7, 1, extent)`, so the surface is continuous and a re-bake changes it by the interpolation difference of two levels.
5. **The march** (ADR 0036 point 4 stands) changes in four ways because the camera may now lie on the ground: (a) the clearance is `(|p|^2 - R^2) / (|p| + R)` expanded from the camera instead of `length(p) - R` (float32 loses 6 cm at 600 km: stair-step cracks on grazing rays), (b) the safe step uses a **local slope bound** `clamp(2 |g| + 0.25, 0.25, 1)` instead of the global 1 (gentle ground is crossed in steps four times longer; the pure reference march agrees with brute force on 97 % of 200 rays either way), (c) the step floor grows from 5 % to 15 % of the distance between 50 and 500 m, with two look-inside samples when the clearance is small, so a ground-hugging camera reaches the horizon in 48 steps, (d) the hit is refined by 5 Illinois (regula falsi) steps instead of 10 bisections. High/medium/low march steps stay 48 / 32 / 20.
6. **Camera clamp.** The environment holds the camera at least 0.5 m above the terrain under it in float64 with the core function. The camera bubble is deleted from the model, the shader and the tests.
7. **Flat zone skip stays**: rays inside the launch site's flat disc are not marched.
8. **Shaders keep taking constants from the TypeScript table** (shape, soft ridge, smooth maximum, warp, patch geometry); a test compares the generated GLSL text with the values.

## Scope decisions (what this plan did not do, and why)

- **Volumetric clouds and light shafts** (draft plan 037): a half-resolution ray-marched slab with a light march and temporal reprojection is a second rendering pass; the published technique targets about 2 ms of a console GPU, and the clouds already cost 2.4 ms at the pad of `high` on the M5 (journal 027). It needs its own budget, ADR and tests; doing it on top of the terrain march (whose cost at ground level rose to 9 ms of the frame) would have hidden which pass breaks the budget.
- **Lakes, river flow, breaking shore waves, launch-site animation, M1/M2 and Intel measurements, mobile, shader precompile** (draft plan 038): lakes need a water level in the core height field (and a sim rule for floating or sinking), the rest are independent of terrain and need hardware this session does not have.

## Alternatives considered

- **Raise the cube resolution.** Matching 4 m would take 150 000 texels per face. No.
- **Analytic evaluation in the march near the camera.** About 90 hash evaluations per step, 15 steps, 2 million pixels: far past the budget of ADR 0025, and impossible on the integrated GPUs.
- **A tessellated mesh (clipmap) instead of marching.** Needs seams, vertex precision under the floating origin and a depth-correct join with the analytic atmosphere (ADR 0036 argued the same). The nested 2D patches here are the clipmap's *data* without its mesh: the planet pass and its exact log depth stay.
- **Half-float hi/lo patches.** Tried first: filtering in half precision errs by 0.5 m at 900 m and showed as contour cracks; the patches are 32-bit (16 bytes per texel, 16 MB per 1024 patch) and the cube keeps hi/lo.
- **Snap patch centres to a texel lattice and shift contents (toroidal update).** Saves bake cost, but the function is analytic and a bake is cheap, so full re-bakes at a coarse lattice are simpler and cannot accumulate error.
- **One patch.** Its edge would pop by the whole cube error (tens of metres) at a kilometre; with two patches the visible edge difference is a few pixels at most.

## Consequences

- Memory: the two patches at `high` are 16 MB each (RGBA32F 1024 squared), 4 MB each at 512; the cube's channel layout changes (still 6 x 1024^2 x 8 B = 50 MB at `high`).
- The planet pass gains up to two fetches per terrain sample near the camera; the measured frame cost is in journal 031.
- The terrain is exact where a vessel can touch it (patch 1 within 2 km) and approximate where it is only looked at.
- GLSL float32 evaluates the same function with a measured error against float64 of 3 cm mean and 20 cm worst case in the fine patch, 4.5 cm and 81 cm in the mid patch (journal 031, readback of 400 texels); the interpolation error of the grids themselves is tested in Bun at 5 cm (fine) and 1 m (mid).

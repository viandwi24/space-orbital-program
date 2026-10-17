# 0116 — The terrain bake's gradient is analytic, in forward mode

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [068](../plans/068-terrain-gradient-bake-and-silhouette-aa.md)
**Amends:** ADR 0072 point 4 (the gradient stayed a finite difference) · **Builds on:** ADR 0036, 0043, 0044, 0142

## Context

Every bake texel stored the tangent gradient as two forward differences, three evaluations of the height function. Measured on the M5 (plan 068), the two extra evaluations were 74 to 81 % of every bake (`high`: 14 of 18.8 ms for the cube and both patches).

## Decision

1. **Forward mode.** The height is evaluated once with every quantity carried as `(value, gradient with respect to n)`, `n` the body-fixed direction as a point of R³: `terrainHeightAndGradient` in core (`terrain-gradient.ts`) and `heightGrad` in GLSL (`terrain.glsl.ts`, `vec4`). Each stage uses its exact derivative: the value noise from its lattice values and the fade's derivative; the octave rotation by its transpose; latitude and longitude of `n`; the map warp; the biome map's bilinear patch (from its four texels; the value keeps the filtered fetch); arc lengths to the zones; smoothsteps; the soft ridge; the smooth maximum; and the branch taken by `min`, `max` and the clamps (subgradients at the creases).
2. A texel stores `(∇h · t1, ∇h · t2) / R`, the same rise over run as before. Central differences in core agree within 2.7e-5 at 10 000 points (Legacy) and 1.1e-7 (another seed, two zones); in the flat zones the gradient is exactly zero.
3. The forward differences stay compiled out behind `TERRAIN_FD_GRADIENT` and `TERRAIN_NO_GRADIENT` for measurements; the shipped program defines neither.

## Consequences

- Bakes cost 8.0 ms instead of 18.2 ms on `high` (M5, cube and both patches); the patches re-bake as the camera moves, so flight frames that re-bake get the saving.
- A change to the height function must change both derivative twins; the core test against central differences catches a wrong one.

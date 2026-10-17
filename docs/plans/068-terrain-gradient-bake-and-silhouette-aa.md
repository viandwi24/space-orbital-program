---
id: 068
title: "Analytic terrain gradients for the bake and anti-aliased silhouettes of the planet pass"
status: draft
owner: ""
depends: [038]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 068 — Analytic terrain gradients and silhouette anti-aliasing

## Goal

Two cost and quality items from plan 031 that plan 038 did not do, because neither is cheap:

1. The terrain bake gets the height's gradient from analytic derivatives of the noise instead of two extra evaluations of the whole height function per texel.
2. The silhouette of the planet pass against the sky (the ground's horizon, a ridge line against the sky, the sea's horizon) is anti-aliased: MSAA has no edge to resolve in a fullscreen analytic pass.

## Context

- Plan 038 measured nothing here and decided against them (ADR 0072, point 4): the gradient bake is three evaluations of a chain of ten functions (`heightAt` in `terrain.glsl.ts`: hills, the rotated octaves, the soft ridge, the smooth maximum, the lake cap, smoothsteps), the bake runs spread over frames and only on a re-bake, so it is not what limits the frame; an analytic gradient needs a hand-derived derivative of each stage and a float64 twin tested against finite differences.
- Value noise has an analytic gradient from the same lattice values (Quilez, `docs/research/three.md`, plan 038); the rotation between octaves is a linear map (the gradient is rotated back); `smoothstep` and the soft ridge have closed-form derivatives; the smooth maximum and `min(relief, cap)` need subgradients.
- For the silhouette: the march knows the miss distance of a ray that leaves the terrain's shell; a coverage estimate from the closest approach of the ray to the surface gives an alpha at the edge, blended into the sky. Sub-pixel shimmer on far ridges (ADR 0053's footprint exaggeration) is related.
- Read: ADR 0036, 0043, 0044, 0053, 0064, 0072; journals 031, 039, 050.

## Scope

**In (to be ordered at refinement):** measure the cube and patch bake times (`gl.finish` around the passes) at the three presets; if the gradient is a measurable share, implement `terrainGradient` in core with a finite-difference test (error bound per stage) and its GLSL twin; measure the silhouette aliasing (a ridge at 30 km against the sky, an edge-detect count of stair steps) and try the coverage estimate; both with the frame table of journal 054 as the baseline.

**Out:** a temporal anti-aliasing pass (no history buffer, ADR 0059).

## Acceptance criteria

- [ ] Bake time before and after at `low`, `medium`, `high` (cube and the two patches), and a gradient test: the analytic gradient is within 1e-3 of the finite difference over 10 000 random points (and exactly equal in the flat zones).
- [ ] Frame table (journal 054's method): no scene more than 0.3 ms over the baseline; budgets `medium` 13.3 ms, `high` 16.7 ms.
- [ ] Silhouette: JPG screenshots of a far ridge and of the horizon, before and after, and a count of stair-step pixels along a rendered edge (at least halved).
- [ ] `bun test`, typecheck, build, docs:check pass; the GPU against CPU parity of `terrain-patch` (journal 031) stays within its bounds.

## Docs checklist

- [ ] STATUS, journal, ADR, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by plan 038 (analytic derivatives and silhouette anti-aliasing pushed out with reasons in ADR 0072).

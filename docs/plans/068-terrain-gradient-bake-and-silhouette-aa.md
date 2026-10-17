---
id: 068
title: "Analytic terrain gradients for the bake and anti-aliased silhouettes of the planet pass"
status: in-progress
owner: "Agent 1"
depends: [038, 084]
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
- Foundation (ADR 0097): the height function becomes per-world seeded with a list of flat zones (plan 084). The analytic gradient must cover the zone blend and the measurements must be taken after plan 084 so they are not stale.

## Scope

**In (to be ordered at refinement):** measure the cube and patch bake times (`gl.finish` around the passes) at the three presets; if the gradient is a measurable share, implement `terrainGradient` in core with a finite-difference test (error bound per stage) and its GLSL twin; measure the silhouette aliasing (a ridge at 30 km against the sky, an edge-detect count of stair steps) and try the coverage estimate; both with the frame table of journal 054 as the baseline.

**Out:** a temporal anti-aliasing pass (no history buffer, ADR 0059).

**Realignment (2026-10-17):** the gradient stages include the flat-zone blend of plan 084 (closed-form derivative of the blend), and the bake timings are taken with two zones present.

## Touches

- **Size:** M
- **Edits:** `packages/core/src/terrain.ts`, `packages/renderer/src/shaders`, `packages/renderer/src`
- **Shared contracts:** core (`terrainGradient`, additive)

## Acceptance criteria

- [ ] Bake time before and after at `low`, `medium`, `high` (cube and the two patches), and a gradient test: the analytic gradient is within 1e-3 of the finite difference over 10 000 random points (and exactly equal in the flat zones).
- [ ] Frame table (journal 054's method): no scene more than 0.3 ms over the baseline; budgets `medium` 13.3 ms, `high` 16.7 ms.
- [ ] Silhouette: JPG screenshots of a far ridge and of the horizon, before and after, and a count of stair-step pixels along a rendered edge (at least halved).
- [ ] `bun test`, typecheck, build, docs:check pass; the GPU against CPU parity of `terrain-patch` (journal 031) stays within its bounds.

## Docs checklist

- [ ] STATUS, journal, ADR, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by plan 038 (analytic derivatives and silhouette anti-aliasing pushed out with reasons in ADR 0072).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0097: per-world seed and flat-zone list first).
- 2026-10-17 — Claimed by Agent 1 (Lead, M5) on `lead/068-terrain-aa` (claim/068).
- 2026-10-17 — **Step 1, bake cost on the M5** (dev build on its own port, Browser pane, pad, governor off, second page load; `debug.bakeMode(rebake, withoutGradient)` bakes the cube and both patches again every frame, `debug.benchmark` minimum of 4 × 15 frames; the production bake program is unchanged, its SHA-256 pin is taken with the measurement branch removed):

  | preset (cube, patches) | frame | frame + full re-bake | re-bake without the 2 gradient evaluations | bake | of which gradient |
  |---|---|---|---|---|---|
  | `high` (1024, 1024) | 17.06 ms | 35.86 ms | 21.85 ms | 18.8 ms | 14.0 ms (74 %) |
  | `medium` | 20.46 ms | 29.79 ms | 22.81 ms | 9.3 ms | 7.0 ms (75 %) |
  | `low` (pane hidden at the end: indicative) | 2.53 ms | 7.27 ms | 3.42 ms | 4.7 ms | 3.9 ms (81 %) |

  The gradient is **the larger share** of every bake (the two extra `heightAt` calls), so the plan's condition to implement `terrainGradient` holds. The frame columns are not a frame table (the pane width changed between presets); the next steps use journal 054's fixed-size method. Reading render targets back through three.js (`readRenderTargetPixels`) after cube bakes broke the patch framebuffers in this page, so the timing goes through the frame benchmark instead.


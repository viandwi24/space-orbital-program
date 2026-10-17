# 0089 — Terrain casts light shafts: per-sample reads of the baked heights along the sun ray

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/062-terrain-shadow-shafts.md
**Builds on:** ADR 0070 (shafts as a second march), 0036 (baked terrain), 0086 (the shared cloud map).

## Context

ADR 0070 left terrain out: a sun behind a ridge lit the haze in front of it as if the ridge were not there, and the massif showed only through cloud shadows. Two ways were named: a per-sample terrain-shadow march (eight height reads each, as `terrainShadow`) or a coarse shadow map of the terrain in sun space.

## Decision

1. **Per-sample reads of the baked cube map along the sun ray**, in the shaft march: each sample of `shaftLoss` (high 8, medium 4) reads `shaftTerrain` heights (high 4, medium 2, low 0, only when the preset has shafts and terrain) at quadratic distances `reach * (k/n)^2` along the ray toward the sun, `reach = min(60 km, (4500 m - altitude) / sunHeight)` (nothing above the tallest summit can block, `terrainReach`), and takes the smallest clearance of the ray over the ground. A sample above the summits skips the reads. Only the cube map is read (not the 4 and 33 km patches: a ridge cast shadow of kilometres does not need them), which halved the cost of the first build that used `terrainH`.
2. **A penumbra proportional to the ray's own height gain** (`terrainVisibility`): `clamp(clearance / (0.5 * sunHeight * distance))`. The first build used the penumbra of `terrainShadow` (a fixed 0.12 of the distance), which shadows flat ground under a low sun (the ray gains only `sunHeight * distance` of altitude): the whole valley in front of a 3-degree sun was in shade. Tied to the gain, flat ground is never shadowed at any sun height and a ridge that rises over half of the gain starts to shade (tested).
3. **Combined with the cloud term** as `1 - (1 - cloud)(1 - terrain)` and applied through the same `applyShaftLoss` path (segment by segment, at most 70 % of a segment's in-scatter), so the composite of ADR 0037 stays ordered. The shader's condition for running the march also accepts clear sky (`SHAFT_TERRAIN > 0`).
4. **No sun-space shadow map.** It would turn every sample into one fetch, but needs a bake per sun move and per camera move of a few tens of km, a frame of reprojection logic and a new texture per preset; the per-sample reads met the budget (journal 062), so it was not built. It is the next step if M1/M2 or a phone is over (drafts 038 / 066).

## Consequences

- Cost (journal 062, same-hour minimum of pages): `high` +0.5 / +0.9 ms in the two scenes that face a low sun behind a ridge, within the noise elsewhere; `medium` +0.4 / +0.6 ms there and +0.1 elsewhere.
- The valley and the haze in front of a ridge that stands between the camera and a low sun are in its shadow, with a lit rim at the crest (`062-before-` / `062-after-ridge3.jpg`): 68 % of the frame is darker by 28 levels on average with the reads against without them in that scene. Beams proper (thin rays between peaks) are as modest as ADR 0070 found for clouds: the home body's terrain near the pad is rolling, not alpine.
- Reads are 1 km-scale: a feature narrower than the gaps between reads (a few km at 60 km reach) is missed or smeared; the penumbra hides it.

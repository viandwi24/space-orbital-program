# 0370 — The launch site's grass is drawn thinner with distance

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/413-pad-launch-site-vegetation.md
**Builds on:** ADR 0369 (relevance gates), plan 039 (site detail ranges)

## Context

Measured on and off at the pad (refs/graphics-v2/07-look-costs.md), the launch site is the whole of what keeps the pad above the 60 Hz floor: its 28 000 grass tufts took 2.6 ms of a 20.9 ms frame and its 2 000 trees 1.1 ms. A tuft is 0.4 m; beyond a few tens of metres it is a few pixels.

## Decision

1. **Tufts are drawn by distance from the camera**, per cell: all of a cell within 15 m, falling to a quarter at 40 m, a tenth to 160 m, none beyond (`tuftDensity`, `TUFT_LOD`). The disc is cut into 8 x 8 cells (from 4 x 4) so the distance is meaningful, each cell's instances are shuffled at build so the first part of the list is an even lawn, and `LaunchSite.thinTufts(cameraRender)` sets each mesh's instance count every frame (a count, no rebuild, no pipeline).
2. The existing site ranges stay (tufts to 600 m from the site, trees to 12 km).
3. **Switches for measurement** (`renderer.debug.setLookOff`): the site, the vessels, the vegetation, trees, tufts and the shadows, besides the earlier looks.

## Consequences

- The pad's mean frame fell from 20.9 to about 18.2 ms and the share of frames over 16.7 ms from 25 % to 9 %; the lawn near the vessel is as before.
- The trees (about 0.6 ms) and what is left of the site are the next costs; the pad is not yet under 16.7 ms at p95.

# 0372 — Vegetation with two levels of detail

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/414-pad-at-120hz.md
**Builds on:** ADR 0370 (the lawn thinned by distance), ADR 0055 (vegetation sets), ADR 0369 (relevance gates)

## Decision

1. **Trees and bushes have a full and a coarse geometry** (`roundTreeGeometryLow`: 140 triangles for 448, `pineGeometryLow` 34 for 74, `bushGeometryLow` 60 for 540); instances within 90 m (trees) and 45 m (bushes) of the camera draw the full one. `LodInstances` (`site-lod.ts`) holds one list of instances and two instanced meshes whose buffers it re-sorts when the camera has moved 8 m: a frame is a count and a visibility flag, no draw per instance, no pipeline (the coarse geometries have the full ones' attributes).
2. **Tufts have a lite twin** (5 triangles for 27): a cell farther than 28 m from the camera draws it, sharing the instance buffers.
3. The look near the vessel is as before.

## Consequences

- About 1.3 million triangles of vegetation at the pad fall to about a third. Measured headed on the M5 the vegetation's share of the pad's frame was 0.8 to 0.9 ms before and after: the levels of detail do not move the pad's frame by more than the noise, so the pad's cost is elsewhere (journal 414). They are kept for the lower tiers.

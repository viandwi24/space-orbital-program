# 0352 — A vessel's static parts are merged per material

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/367-vessel-parts-merged-per-material.md
**Builds on:** ADR 0290 and ADR 0310 (every pipeline the world can draw is built at load), plan 363's research

## Context

Each part model draws its own mesh per material slot, so Kronos-class vessels cost about 270 draw calls at `medium` and `high` and about 115 at `low` on WebGPU, and the shadow pass repeats most of them.

## Decision

1. **A `VesselBatch` per vessel** (`parts/vessel-batch.ts`). It merges the static meshes of the vessel's parts, in the vessel's frame, into one mesh per material (and per set of vertex attributes and indexedness), and hides the parts' own static meshes. `BatchedMesh` was not used: the parts of a vessel are rigid and the set changes only on staging, docking or a break, so a rebuild on change is simpler and every merged mesh is an ordinary mesh with the pipelines the scene already builds.
2. **Out of the batch:** moving pieces, shrouds, plumes, puffs, lamps, and a part that glows (`PartModel.cloned`: its materials are its own clones for the heat emissive, and it stays out for good). A model in the Hangar and any model without a `staticMesh` are unaffected.
3. **Rebuild** when the signature of (part id, root position and rotation to a millimetre, the identity of the static mesh, cloned or not) changes: a number per part folded each frame, no allocation. A replaced model (a preset change) has a new mesh identity and is merged again; the old merged meshes are removed and their geometry disposed.
4. **No new pipeline:** a merged mesh uses the parts' own materials, so the pipelines are the ones built at load.

## Consequences

- Draw calls on the M5 (WebGPU, the booster at the pad): `medium` 273 to 121, `high` 275 to 108, `low` 117 to 57; at 3 km `medium` 226 to 74, `high` 233 to 69. Triangles are unchanged.
- A rebuild costs a pass over the parts' vertices (a few milliseconds for the vessel); it happens on a change of the part set, not per frame.
- A vessel with hot parts (re-entry) keeps those parts' meshes: they leave the batch one by one as they start to glow.

# 0087 — The half-resolution rung redraws its edges at full resolution

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/056-cloud-shadow-map-and-half-res-edges.md
**Builds on:** ADR 0064 (the half-resolution planet pass and its depth-aware upsample), 0053.

## Context

At the half rung the planet pass is drawn at half the side and upsampled with weights that never blend across a depth edge (ADR 0064). A ridge against the sky is therefore a staircase of 2 x 2 steps, and the rim of a cumulus, which has no depth edge but a jump of colour, is a beaded line (journal 050, crops in journal 056). The draft suggested a one-pixel edge-aware reconstruction or temporal reprojection (no history buffer exists).

## Decision

1. **Draw the planet pass again, at full resolution, for the edge pixels only.** After the upsample, a second mesh with the same program (`planet-edge`, `uEdgeOnly` = 1, the pixel angle of the full target, `uMarchScale` 0.5 so the march prepass of the half pass is read at the right block) is drawn over it. The first line of its `main` reads the four half-resolution texels around the pixel (the ones the upsample reads) and `discard`s unless the pixel is an edge. It writes the colour and the fragment depth, so the vessel is tested against the sharp edge. No new program: it is the planet program, which the precompile already compiled in the target's state.
2. **An edge is** (a) a pixel whose four texels are not within 0.3 octaves of distance of the nearest texel's (ground against sky, a ridge against its valley), or (b) all four sky and their chroma `(b - r) / (b + r)` differs by more than 0.12 (the rim of a cloud). `isEdgePixel` in `half-res.ts` is the tested twin. Ground texture and the brightness inside a cloud are not tested: the first attempt tested luminance and marked the whole cloud (the march's jitter varies it), then 0.08 of chroma marked a thin cirrus; each of those would have run the expensive pass over a large share of the sky.
3. **Only on the half rung.** The mesh is hidden at full resolution; the default path is unchanged.

## Alternatives considered

- **Colour-gradient texel choice inside the nearest depth class:** it chooses between four half-resolution samples; none of them lies on the true edge, so the staircase stays.
- **Temporal reprojection:** needs a history buffer the planet pass does not have (ADR 0059).
- **A stencil or tile mask** to avoid the four fetches per pixel: the unconditional `discard` costs nothing measurable but the test about as much as the edge shading; a mask pass would add a pass for under half a millisecond. Left for a measurement on weaker GPUs.

## Consequences

- The half rung costs 0.85 to 1.5 ms more (edge pass on against off in one page, journal 056: `high` pad +1.04, hillside +1.46; `medium` pad +0.85, hillside +1.34), against 5 to 7 ms saved by the rung (journal 050): its saving is a little smaller and its ridges and cloud rims are the full-resolution ones (crops in journal 056).
- A ridge or a cloud rim drawn at the full-resolution footprint beside a half-resolution interior: the footprint-driven fades differ by a factor 2 across the edge; not visible in the crops.

# 0195 — Silhouettes of the planet pass: coverage at a miss's closest approach, one shading function, grazing normals

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 133
**Builds on:** ADR 0053 (the march and its prepass), 0059 (no history buffer), 0116 (the analytic bake gradient), 0036 (terrain in the planet pass).

## Context

The planet pass is one analytic fullscreen pass. MSAA has nothing to resolve in it, and ADR 0059 rules out a history buffer, so its silhouettes alias. The first screenshots (`docs/journal/assets/133-zoom-*.jpg`) showed two defects:

1. **Stair steps along a ridge.** Each pixel is all ground or all sky.
2. **A dark dashed line along a ridge's crest.** It is visible from the pad with the coverage off. It has two causes:
   - Rays that graze the crest shade the rim edge-on. Their normal is perpendicular to the view, and the rim shadows itself.
   - Rays that cross a thin crest between two march samples miss it. They reach the sea-level sphere far behind it and shade dark water.

## Decision

1. **One shading function.** `shadeRay(ro, rd, r0, d, h, hitG, hitT, tG)` holds what `main()` did after the hit test:
   - the ground or the sky;
   - the atmosphere and the cloud layers;
   - the aurora.

   `main()` calls it from one call site in a two-pass loop, so the program keeps one copy of the shading.
2. **Coverage on the miss side.**
   - `marchTerrain` keeps the smallest clearance of its samples in pixel footprints, `s = c / (t · pixelAngle)`, together with the samples before and after it.
   - After a miss within 1.5 footprints, it reads the real clearance once, where the parabola through those three samples is lowest.
   - The sea horizon's closest approach is analytic.
   - A ray with `cover = clamp(0.5 − s, 0, 1) > 0` is shaded a second time as ground at that distance and blended by `cover`.
   - The hit side is left as it is.
3. **A crest stepped over is a hit.** If the refined clearance is below zero, the ray crossed the ground between two samples. `main()` takes that as a terrain hit there, not as the sea behind it.
4. **Grazing ground.** When `|n · rd|` falls from 0.2 to 0.03, the shading normal leans to level ground (`nBF`) and the terrain self-shadow fades out. A grazing pixel spans the face in front of the rim as well as the rim.
5. **A switch.** A uniform turns the coverage, the crest rule and the grazing rule off together (`Renderer.debug.silhouetteAA(false)`), for before and after screenshots. It is on by default on every preset.
6. **The CPU twin.** `terrain-model.ts` reports `closest` on every march (`silhouetteCoverage`, `parabolaMin`), and it is tested.

## Consequences

- **Measured on an Apple M5,** at 1920 × 1080, high and medium presets, in Playwright's Chromium on Metal. The baseline is the previous build:
  - The frame costs +0.29 to +0.75 ms on `high` and +0.32 to +0.42 ms on `medium`.
  - The coverage itself is about 0.05 ms of that.
  - The rest is the march bookkeeping and the larger program.
  - Runs differ by about 0.3 ms from one another.
- **Stair steps at a far ridge,** counted against a 4-sample reference, fall to 0.44 to 0.49 of the count without the coverage.
- **The hills horizon cannot be counted that way.** At ratio 2 the terrain detail changes, and the silhouette moves.
- **The dark dashed line is gone** in the zoomed screenshots.
- A pixel is covered by at most a half. The hit side of an edge stays hard. Coverage on the hit side would need a march past the hit, and that is left for later.

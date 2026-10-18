# 0211 — The silhouette coverage blend is deferred to a resolve pass; the planet pass keeps one shading

**Status:** accepted
**Date:** 2026-10-19
**Plan:** 133
**Supersedes:** ADR 0195 point 2 (the second shading and the blend). Its points 1 and 3 to 6 stand.

## Context

ADR 0195 blended a partly covered sky pixel with a second shading of the ground at the ray's closest approach. Measured on the Apple M5 at 1920 × 1080, on `high`, with the quality governor off, every form of that second colour in the planet pass costs too much (journal 133):

| Form of the second colour | Cost over the pass before plan 133 |
|---|---|
| A second call of `shadeRay` in a two-pass loop | +0.39 to +0.51 ms |
| The same loop with a bound that cannot be unrolled | +0.31 to +0.41 ms |
| A light second pass, without clouds, aurora or shafts | +0.50 to +0.65 ms |
| The 2 × 2 quad neighbour's colour through `dFdx` / `dFdy` | +0.79 to +0.98 ms |

The cost is the same with the coverage switched off. It belongs to the program, not to the edge pixels it runs on.

## Decision

1. The planet pass shades a ray once and does not blend.
2. It keeps the rest of ADR 0195:
   - the shading function and the closest approach;
   - the rule that a crest stepped over between two samples is a hit;
   - the grazing normal and self-shadow;
   - the uniform switch.
   This measures +0.01 to +0.21 ms.
3. The blend comes back as a resolve pass of its own:
   - the planet pass writes its coverage and the ray's closest distance to a target;
   - a small pass blends the edge pixels with the ground beside them.
   It is not planned yet.

## Consequences

- The dark dashed line along ridges stays fixed.
- The stair steps of a silhouette are back to one pixel, as before plan 133.
- Plan 133 is `blocked` on its stair-step criterion until the resolve pass exists.

---
id: 133
title: "Anti-aliased silhouettes of the planet pass"
status: in-progress
owner: "Agent 1 (Lead)"
depends: [068]
phase: 3
created: 2026-10-17
updated: 2026-10-18
---

# 133 — Anti-aliased silhouettes of the planet pass

## Goal

The silhouette of the planet pass against the sky (the ground's horizon, a ridge line, the sea's horizon) is anti-aliased: MSAA has nothing to resolve in a fullscreen analytic pass, so edges show stair steps and far ridges shimmer.

## Context

- Scope pushed out of plan 068 (which did the analytic bake gradient, ADR 0116). Read: plan 068's Log, ADR 0053, 0059 (no history buffer), 0072, journals 039, 050, 054; `packages/renderer/src/shaders/planet.glsl.ts` (`marchTerrain`, `main`), `march.glsl.ts`.
- What 068 found: the march knows, for a ray that misses, its smallest clearance `c / (t · pixelAngle)` in pixel footprints; a coverage `clamp(0.5 − s, 0, 1)` from it is cheap. Using it needs **both** colours for an edge pixel (ground at the closest approach and sky), and `main()` is about 250 lines of one path (clouds, aurora, atmosphere, the wave normals' `dFdx`), so the work is to split the shading into a function that can run twice for the few edge pixels, with derivatives taken outside non-uniform control flow (or replaced by analytic ones).

## Scope

**In:** the closest-approach clearance in `marchTerrain`; shading split so a pixel can be shaded as ground at a given distance and as sky; coverage blend for pixels with `s < 1` (miss side; the hit side if it measures better); the same for the sea horizon (analytic sphere).

**Out:** temporal AA (ADR 0059).

## Touches

- **Size:** M
- **Edits:** `packages/renderer/src/shaders/planet.glsl.ts`, `packages/renderer/src/planet.ts`
- **Shared contracts:** none

## Acceptance criteria

- [x] JPG screenshots of a far ridge and of the horizon, before and after, and a count of stair-step pixels along a rendered edge (at least halved). The far ridge is at 0.44 to 0.49 of the count; the hills horizon could not be counted (journal).
- [ ] Frame table (journal 054's method): no scene more than 0.3 ms over the baseline; budgets `medium` 13.3 ms, `high` 16.7 ms. **Not met:** `high` is +0.29 to +0.75 ms and `medium` +0.32 to +0.42 ms (journal 133).
- [x] `bun run test`, typecheck, build, docs:check pass; the terrain parity e2e stays within its bounds.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/133-planet-pass-silhouette-anti-aliasing.md` written.
- [x] ADR for the shading split ([0195](../decisions/0195-planet-pass-silhouette-coverage.md)); `docs/architecture/overview.md` (planet pass).

## Log

- 2026-10-17 — Created by Agent 1 from plan 068 (the silhouette half), with what 068 learned about the shading split.
- 2026-10-18 — Agent 1 (Lead), on lead/followups (ADR 0195):
  - Built `shadeRay`, the closest approach with a parabola refinement after the loop, the coverage blend, the rule that a crest stepped over is a hit, and grazing normals and self-shadow.
  - Stair steps at a far ridge fell to 0.44 to 0.49 of the count, and the dark crest dashes are gone.
  - The frame cost is over the criterion: `high` +0.29 to +0.75 ms, `medium` +0.32 to +0.42 ms.
  - Left `in-progress` for the owner to accept the cost or have it cut. Measurements are in journal 133.

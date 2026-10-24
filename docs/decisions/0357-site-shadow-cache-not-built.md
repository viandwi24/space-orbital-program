# 0357 — A cached shadow map for the static site is not built

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/369-cached-shadow-maps-for-the-static-site.md
**Builds on:** ADR 0310 (the sun always casts), ADR 0321 (one mesh per site)

## Context

The sun's shadow map re-renders every caster each frame. Plan 369 proposed rendering the site's still casters into a cached map and redrawing only the vessels.

## Findings

1. **What casts.** At the pad (the booster, WebGPU) the casting meshes outside vessels, moons and effects are 23 meshes of about 190 000 triangles in all (the site's buildings, the crew models, the pad); the vessel is about 35 000 triangles after plan 367.
2. **What they cost.** `scripts/measure-site-shadow.ts` switches the 23 meshes' `castShadow` on and off in turn in one page (three rounds of 10 s each, the M5, Chrome, 120 Hz, TAAU off): at `medium`, p50 8.43 ms with and without, GPU 3.12 against 3.03 ms; at `high`, GPU 3.77 against 3.85 ms (the p50 and p95 of the two states cross over, with the machine's load going from 4 to 12 during the run). The whole static caster set is worth about 0.1 ms.
3. **What a cache costs.** Three r186's shadow node renders the scene into one target and clears it; a cache needs the static pass in a second target and a copy of its depth (4096² at `high`: 64 MB read and written) into the shadow map every frame before the vessels draw into it with no clear, which means replacing `renderShadow` of the node. The copy costs about what the pass it saves costs, and the static map is stale whenever the sun or the fitted frustum moves (always in flight, texel by texel at the pad).

## Decision

Not built. The plan closes on its measurement. `measure-site-shadow.ts` stays for the day the site's casters grow.

## Consequences

- The shadow pass's cost is the vessel's and the map's size, not the site's.
- If the site ever has far more casters, the cache is still the way: a static target with a depth copy and a custom `renderShadow` that filters on `userData.shadowStatic`.

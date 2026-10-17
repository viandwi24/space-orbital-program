# 0081 — Engines with several nozzles: `plume.nozzles`, a cluster generator, a stock cluster engine

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/040-effects-and-assets-3.md

## Context

`PartVisual.plume` (ADR 0028) names one nozzle exit, so an engine with several bells could only have one plume. Draft 040 said real models were needed to judge multi-nozzle engines. The layout and the descriptor do not need art; art can use the same descriptor later through the asset path (ADR 0076).

## Decision

1. **Descriptor** (API 0.1.22 to 0.1.23, additive): `visual.plume.nozzles?: [x, y, z][]`, 2 to 9 exit centres in the part frame. Each bell draws its own plume of the descriptor's `exitRadius` and `length`; `nozzle` stays the thrust centre that the scene's ground effects (dust, ground light, the exhaust trail) use, so a cluster behaves as one engine for them. The gimbal swings all bells together (they hang on one pivot).
2. **Renderer.** `PlumeEffect` builds a holder per bell (three meshes sharing the effect's three materials, so a cluster costs draw calls but no extra uniforms and no extra programs). The shock-diamond period is now proportional to the exit diameter (`diamondPeriod(exitRadius) = 5.7 x exitRadius`, which keeps the LV-T30's 2.6 m), where it was a constant 2.6 m for every engine.
3. **Layout.** `clusterLayout(count, ring, y)` (renderer, `parts/cluster.ts`) puts the bells on a ring, evenly spaced, the first at half a step (so four sit on the diagonals). The `engine-cluster` generator uses it for the geometry, and the stock descriptor lists the same points; a test pins them equal within 1e-6 and checks the bells fit the part and do not touch.
4. **Stock part** `stock.engine-cluster` ("KR-4 Cluster Engine", 1 850 kg, 340 kN vacuum, Isp 295 / 272 s, gimbal 2 degrees at 16 degrees/s, four bells of exit radius 0.2 m on a ring of 0.31 m) draws the cluster: a new stock part, so the VAB lists it under Engines (the engine module sets the category).

## Alternatives considered

- **One bigger plume** for a cluster: loses the look the feature is for.
- **`nozzles` replacing `nozzle`**: a single required centre keeps every existing consumer valid and gives clusters a defined thrust centre.
- **Count and ring in the descriptor** (`bells: 4, ring: 0.3`) only: shorter, but a model from the asset path would have no way to say where its bells are, and the plume would depend on a generator's parameters.

## Consequences

- Mods can ship multi-nozzle engines procedurally (`engine-cluster` with `params`) or with a model plus `nozzles`.
- `stock.engine-cluster` is new content: it changes no existing flight (no test part list is affected), and players have an engine to choose.

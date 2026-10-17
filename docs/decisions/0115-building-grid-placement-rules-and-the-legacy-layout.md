# 0115 — Buildings: a 10 m grid centred on the site, placement rules, and the Legacy layout

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [090](../plans/090-building-registry-and-placement-rules.md)
**Builds on:** ADR 0097 points 1, 4 and 5 (sites, free placement on a grid, buildings as data), ADR 0142 (sites in the world), ADR 0104 (define points), ADR 0170 (patches)

## Context

Plan 090 makes buildings data and the placement rules pure functions. ADR 0097 left the cell size and rotation steps to this plan. Plan 084 made the Legacy site implicit: a world with an empty `sites` list has `LEGACY_SITE`.

## Decision

1. **Grid.** Square cells of 10 m on the site's tangent plane, in site metres east and north of the centre (the axes of `SitePad`). Cell `(i, j)` covers `east ∈ [10i − 5, 10i + 5)`, `north ∈ [10j − 5, 10j + 5)`: cells are centred on multiples of 10 m, so an odd-sized building can sit centred on the pad. Rotations are 0, 90, 180 and 270 degrees. A building at `cell` with `rotation` covers its `size { w, d }` (cells east × north at rotation 0, swapped at 90 and 270) from that corner cell towards +east and +north.
2. **Rules** (`canPlace`, core, pure), each with a reason: `body` (not allowed on the site's body), `outside-zone` (a footprint cell centre farther than the site's `flatRadius` from the centre), `overlap` (a footprint cell already holds a building or a road), `hazard` (any footprint cell centre within another building's `hazardRadius` of its footprint centre, or the reverse), `no-road` (an entrance cannot reach the road network through free cells). The road network is the site's road cells; a site without roads accepts its first building with no road check. Road completion is a breadth-first search over 4-neighbour free cells from the cell in front of each entrance to the nearest road cell, ties broken by direction order east, north, west, south; the path is returned for the preview and added to the roads on placement.
3. **Entrances** are cells on the footprint's edge, in local cells at rotation 0, with the side they open to (`east`, `north`, `west`, `south`); they rotate with the building.
4. **Site data.** `Site` gains `buildings` (`{ id, kind, cell: { i, j }, rotation, level, state }`) and `roads` (cells), both defaulting to `[]`, additive inside format 5. Placed-building ids come from the host (UUIDs), never from the sim.
5. **The Legacy layout** is data in core next to `LEGACY_SITE`: today's launch site (`packages/renderer/src/site.ts`) snapped to the grid: Launchpad S centred on the pad, Hangar, Mission Center, Administration, and today's roads rasterised. Like `LEGACY_SITE` itself it names stock ids (`stock.launchpad-s`, …); it is the stock world's history, not a rule for other systems. `sitesOf` returns `LEGACY_SITE` with this layout. The first `place-building` on an implicit Legacy site writes the site, layout included, into `WorldInfo.sites`.
6. **Commands** `place-building { site, kind, cell, rotation, id }` and `remove-building { site, id }` are validated by the same `canPlace` and are instant in this plan (096 adds cost and construction time). `Snapshot.sites` lists each site's id, buildings and roads.
7. **Patching:** `building` joins `PATCH_TARGETS`.

## Consequences

- The renderer still draws today's procedural site; 091 builds the Space Center from the building list and drops the hard-coded layout.
- 096 fills level costs, build days and upkeep (as charges), and can add earthworks for `outside-zone`.

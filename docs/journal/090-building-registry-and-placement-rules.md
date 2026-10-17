# 090 — Buildings as data: `defineBuilding` and the placement rules

**Plan:** plans/090-building-registry-and-placement-rules.md · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-17 · **ADRs:** [0115](../decisions/0115-building-grid-placement-rules-and-the-legacy-layout.md) (new), [0097](../decisions/0097-sites-space-center-in-3d-free-grid-bases-and-range-safety.md), [0104](../decisions/0104-every-system-ships-a-define-point-and-typed-patches.md), [0142](../decisions/0142-sites-terrain-seed-zones-and-placement.md) · **Research:** none

**Status when written: criteria met** (output in the plan's Log).

## What was done

| Where | What |
|---|---|
| `packages/core/src/buildings.ts` | `BuildingDefinition` and schema (entrances must face out of the footprint edge), `PlacedBuilding`, the 10 m grid, `footprint` with rotations, `entranceFronts`, `canPlace` with six reasons, `pathToRoad`, `roadLine`, `LEGACY_LAYOUT` |
| `packages/core` registry, plugin, patch, sites, protocol | `buildings` registry, `ctx.buildings`, report kind `building`, patch target `building`, `Site.buildings` and `Site.roads` (optional), `LEGACY_SITE` with the layout, `place-building`, `remove-building`, `Snapshot.sites`; `API_VERSION` 0.1.36 |
| `packages/sdk` | `defineBuilding`; `canPlace`, `footprint`, `LEGACY_LAYOUT`, `LEGACY_SITE`, `sitesOf` and the types |
| `packages/sim/src/buildings.ts` | the two commands (the implicit Legacy site is written into `WorldInfo.sites` the first time), the snapshot view |
| `mods/stock/src/buildings.ts` | 11 kinds: Hangar, Launchpad S/M/L, Runway, Mission Center, Astronaut Complex, R&D, Administration, tracking dish, propellant plant |
| tests | `packages/core/test/buildings.test.ts` (8), `mods/stock/test/buildings.test.ts` (3), `packages/sim/test/buildings.test.ts` (3) |

## Decisions and surprises

- **The grid is centred on the pad.** Cells are centred on multiples of 10 m, so the 3 × 3 Launchpad S sits exactly on today's pad and odd sizes centre cleanly. Today's site (`packages/renderer/src/site.ts`) snapped to that grid moves the hangar, control centre and office by at most 5 m; the renderer still draws its own layout until 091.
- **Hazard is measured cell centre to footprint centre.** With Launchpad S at 40 m, the nearest Mission Center cell centre is 53.9 m away, so the Legacy layout is valid without moving it; the stock test pins that.
- **An import cycle:** `schemas.ts` imports `sites.ts` (084), which now imports `buildings.ts`, so `buildings.ts` cannot use `definitionIdSchema` from `schemas.ts` at module load. It builds its own from `DEFINITION_ID_PATTERN`.
- `Site.buildings` and `roads` are **optional** rather than defaulted: other code (087's Create World, tests) builds `Site` objects, and a required output field would have broken them; absent means none.
- The snapshot's `sites` is rebuilt every snapshot; it is small (a few buildings) but 091 may want it cached like `rules`.

## Not met / not done

- Costs, construction time, upkeep and earthworks: plan 096. 3D view and placement UI: 091. Site choice: 092.

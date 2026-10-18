# 128 — Off-world bases: base kits and parts left on the surface

**Plan:** [plans/128-off-world-bases.md](../plans/128-off-world-bases.md) · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-18 · **ADRs:** [0125](../decisions/0125-off-world-bases-kits-outposts-isru-supply-routes.md) (new), [0097](../decisions/0097-sites-space-center-in-3d-free-grid-bases-and-range-safety.md), [0124](../decisions/0124-markets-one-propellant-chain-site-storage-launch-fuel.md), [0123](../decisions/0123-construction-on-the-tick-capacity-keys-upkeep.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `core/moon-terrain.ts` | `cratersZones`, `zonedMoonHeight`; `createMoonTerrainField({ zones })`; `createBodyTerrainField` passes a craters body its site zones |
| core | `BuildingDefinition.placement` and the `placement` reason in `canPlace`; `Site.members`; `SupplyRoute` and `SimSave.economy.routes`; commands `deploy-base`, `join-site`, `create-route`, `delete-route`; events `site:joined`, `site:left`, `route:delivered`; `Snapshot.sites[].members` and `.body`, `Snapshot.economy.routes`; API_VERSION 0.1.64 |
| `sim/bases.ts` | `deployBase` (founds through `foundSite` with the hub layout), `joinSite`, `membersTick`, drills, `windowDays`, `createRoute`, `deleteRoute`, `routesTick`; recipes consume their inputs (`market.ts`) |
| `mods/stock/bases.ts` | `stock.base-kit` and `stock.drill` (module and part), the base hub, ISRU plant and storage module (`off-world`), ice, `stock.ice-electrolysis`; the Space Center's buildings are `home`; tech node `stock.surface-operations` (tier 5) |
| renderer | the moon pass's craters bakes read `uCraterZones`, `uCraterZoneBlend` (blend, centre height), `uCraterZoneCount`; its CPU height is the sim's zoned field; the host sends a craters body's zones in `bodyTerrain` |
| web | the Space Center's site picker; for a base: the off-world build kinds placed on the first free cell, and the Flows panel (recipes, drills, routes, storage) |
| tests | sim `bases.test.ts` (5), core `craters-zones.test.ts` (2), renderer `craters-zones.test.ts` (1), vitest `space-center/model.test.ts` (+2) |

## What surprised me

- **Craters ground had no zones.** The landing plain at (0, 0) was its only flat spot. Flattening a zone to a fixed level would have floated or buried the lander that founded it, so a zone flattens toward its centre's own height instead (ADR 0125 point 1).
- **The debt gate:** drills take the same gate as production (nothing on a day the world ends in debt); a route runs on its window regardless and may take the funds below zero, like upkeep.
- `Sim.worldInfo` is a frozen copy that is refreshed when the rules change, so a test cannot move a site to fake a drive-off. The outpost test lifts the rig off on its engine across a day boundary instead.
- The base kit at tier 5 locks it in Career worlds until Life support is researched; the sim tests switch the tree off and leave pacing to `mods/stock`'s test.

## How to test manually

1. In a Career world with the tech tree off (or with Surface operations researched), fly a lander with a Base Kit to Cinder.
2. Land it and send `deploy-base` (no button yet: `__orbital.send({ type: 'deploy-base', vessel, id, name })` in a dev build).
3. In the Space Center pick the new site: the Flows panel shows its storage, and the build dock offers the ISRU plant and the storage module.

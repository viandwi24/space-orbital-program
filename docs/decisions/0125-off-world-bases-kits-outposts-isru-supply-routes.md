# 0125 — Off-world bases: a kit that founds a site, outposts as members, one ISRU step, supply routes on transfer windows

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [128](../plans/128-off-world-bases.md)
**Builds on:** ADR 0097 point 7 (bases two ways), ADR 0177 point 6 (`found-site`), ADR 0142 (zones), ADR 0123 (levels, capacity), ADR 0124 (commodities, recipes, site storage), ADR 0147 (milestones), ADR 0054 (craters terrain)

## Context

Plan 128 asks for a base kit, outposts, an ISRU chain, a supply route and a flow panel, but its draft does not say how. Some of the pieces it needs already exist:

- `found-site` (092) can open a base on any body, but its flat zone only shapes `hills` ground. The craters height function has one fixed landing plain at (0, 0).
- Sites carry buildings and storage (096, 097).
- No stock building is meant for another body, and none of the stock parts drills.

## Decision

1. **Flat zones on craters ground.**
   - `moonHeight` takes the zones of the sites on its body. Inside a zone the relief is blended out toward the height of the raw ground at the zone's centre, with the same smoothstep from `flatRadius` to `flatRadius + blendWidth` as on hills.
   - The landing plain at (0, 0) stays as it is. A zone can only flatten more.
   - Flattening toward the local height means a lander already standing there neither floats nor sinks when the zone first applies (on the next load, ADR 0177 point 6).
   - The renderer's craters bake reads the same zones (`uZones`, `uZoneBlend`, `uZoneCount`, plus `uZoneHeight` with each centre's raw height), so sim and picture agree.
2. **The base kit.**
   - A stock part `stock.base-kit` carries the module `stock.base-kit`.
   - The command `deploy-base { vessel, name }` needs that vessel landed and at rest on a body other than the home body. It founds a site of kind `base` at the vessel's position, using `found-site`'s rules: no overlap with another zone, at most `MAX_TERRAIN_ZONES` sites per body.
   - The new site's layout is one `stock.base-hub` building at its centre.
   - The kit vessel is consumed: it is removed as `deployed`.
3. **Where a building may stand.**
   - `defineBuilding` gains `placement?: 'home' | 'off-world'` (absent: anywhere).
   - Stock: the Space Center's buildings (Hangar, pads, runway, Mission Center, Astronaut Complex, R&D, Administration, tracking dish, propellant plant, test stand) are `home`. The hub, the ISRU plant and the storage module are `off-world`.
   - `canPlace` refuses with the reason (`placement`).
   - The Space Center's build dock lists only the kinds the selected site's body allows.
4. **Outposts are members of a site.**
   - `join-site { vessel, site }` needs the vessel landed at rest within the site's flat radius, on the same body. It adds the vessel id to `Site.members` (an optional field; the save format does not change).
   - On each world tick, a member that has left `flatRadius + blendWidth` of the centre, or is no longer landed, leaves the site (`site:left`).
   - A landed member's `stock.drill` modules add `stock.ice` to the site's storage on the tick, up to its capacity: 50 u a day per drill.
   - A vessel that drives away stops producing at the next tick.
5. **One ISRU step.**
   - `stock.ice` is a fixed-price commodity: it is not traded.
   - The recipe `stock.ice-electrolysis` runs in `stock.isru-plant`: 100 u of ice in, 40 u of liquid fuel and 49 u of oxidizer out, per day at factor 1.
   - Recipes now consume their inputs. A day's run is the largest fraction of the recipe (at most 1 × the factor) that the stored inputs allow and the storage room takes. `power` inputs are not stored and do not limit.
6. **Supply routes.**
   - `create-route { id, from, to, commodity, amount }` needs a proven flight: the world has the `landing` milestone on the destination's body.
   - On each transfer window it moves `amount` from the source's storage to the destination's (as much as there is and as fits), and books the stock launch-service price (`stock.launch-service`, 30 000) plus the cargo at the market price when the source is the home body's site and storage runs short. Ledger cause: `stock.supply-route`.
   - The window comes every synodic period of the two bodies' orbits around their common parent. For a moon of the home body, that is the moon's orbital period.
   - Routes live in `SimSave.economy.routes`, an optional field.
   - `delete-route { id }` removes a route.
7. **The flow panel.**
   - The Space Center gains a site picker.
   - For the selected site it shows a Flows panel: each recipe's and drill's daily rate in and out, and each route's cargo and next window.
   - The 3D view stays the home Space Center: drawing a base's buildings on another body's ground is a renderer plan of its own. A drawn Sankey is a later UI pass on the same numbers.

## Consequences

- A world's terrain seed and the zones now shape craters bodies as well. A craters body with no base on it is unchanged, byte for byte.
- Life support for a crewed base, power budgets and colonies stay out (ADR 0097: a base is a site with buildings and members).

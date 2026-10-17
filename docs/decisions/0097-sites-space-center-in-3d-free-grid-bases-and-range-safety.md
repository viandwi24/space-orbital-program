# 0097 — Sites: the Space Center is the first site, built in 3D on a free grid; site choice, bases and range safety

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "sites-now", "sc-presentation", "sc-layout", "site-choice", "offworld-bases", "range-safety", 2026-10-17); delivered by plans 084, 090, 091, 092, 094, 096, 127, 128
**Amends:** ADR 0030 (the launch site at body-fixed (0, 0) becomes the Legacy world's first site), ADR 0043 (the terrain is no longer built around one site).
**Research:** `refs/reverse-engineering-ksp2/02-space-center-and-buildings.md`, `beyond/08-space-center-building-and-colonies.md`, `refs/space-orbital-program-ui/docs/SCREENS.md` (Space Center, Launch).

## Context

Orbital has one launch site at body-fixed latitude 0, longitude 0 (ADR 0030) and a height function whose biome map and 5 km flat zone are built around it (ADR 0043). The owner wants a Space Center the player builds ("like Cities: Skylines, but simple"), chosen where on the planet it stands, more sites later in a career, bases on other bodies, and launch azimuths that matter. The refs UI draws the Space Center as a 2D isometric campus; the owner chose full 3D using the existing site renderer, and free placement on a grid rather than fixed plots (research had recommended plots with light adjacency and the 2D isometric view; both are recorded below).

## Decision

1. **Site abstraction now.** A site is world data: `{ id, name, body, latitude, longitude, flat zone (radius, blend), kind (space-center | base | outpost), buildings[], member vessels[] }`. The Space Center is the first site of every world. The sim places vessels at a site's pad or runway (`placeOnSurface` already takes body-fixed coordinates).
2. **Terrain per world.** The global height function is generated from the world seed, independent of any site; flat zones are a list taken from the sites and applied on top (blend at the rim). The Legacy world uses the old seed and one zone at (0, 0) with 5 km, and must reproduce today's heights (a test compares them).
3. **Space Center in 3D.** The existing site renderer (ADR 0030, 0073) builds the center from the building list: each building kind is a procedural generator like a part's visual, optionally a `.glb` from a mod (ADR 0076), rebuilt when the list changes, instanced when repeated. The refs layout survives as an overlay: clickable labels with status, a detail panel, a "Needs attention" list, a building dock, the world capsule. A list and keyboard navigation make every building reachable without the camera.
4. **Free placement on a grid.** Buildings snap to a grid on the flat zone (cell size and rotation steps of 90 degrees fixed at refinement), with pure, tested rules in core: footprint inside the flat zone (or an earthworks cost to extend it), no overlap, hazard clearance around pads and test stands scaled by pad size, and road access (each entrance connects to the road network; roads are drawn by the player and completed automatically along the grid). Construction takes game time and money on the world tick (ADR 0098).
5. **Buildings are data.** `defineBuilding` (id, size, levels with cost, build time, upkeep, power, capacity effects, `provides` capabilities such as launch pad, runway, comms node, lab, storage, production; allowed bodies; visual). Stock buildings: Hangar, Launchpad (sizes), Runway, Mission Center, Astronaut Complex, R&D, Administration, tracking dishes, and production buildings for the economy. Levels raise **capacity and scale only** (ADR 0098 point 3).
6. **Site choice.** At world creation the player picks the primary site on the globe or from **location templates** for a quick start (for example equatorial coast, mid-latitude coast, inland plateau, high latitude, island), each resolved against the world seed to a concrete flat spot with its consequences shown (rotation boost, reachable inclinations, downrange over sea or land, recovery). In Career, more sites are bought later; vessels and crew move between sites by an abstract transfer (cost and time).
7. **Off-world bases, two ways.** (a) The building system: a base kit lands, deploys and opens a site on another body with the same catalogue filtered by the body's rules. (b) Vessel parts left on the surface: a landed vessel can be made a member of a site (an outpost); its parts keep working on the world tick and it can be moved again (a rover drives away and leaves the site). Both feed the same site record.
8. **Range safety is a world rule**: `cost` (default: an azimuth outside the site's safe fan, or spent stages predicted to fall on land or another site, are allowed with a funds and reputation penalty shown before launch), `hard` (refused with the reason), `off`. The safe fan is computed from the geography around the site; impact points come from the debris rails that already exist (ADR 0021).

## Alternatives considered

- **Defer sites** — rejected by the owner: bases and second sites would need special cases later; the terrain change is cheaper now.
- **2D isometric Space Center** (refs, research recommendation: light, readable, generated from the list) — not chosen; 3D reuses the site renderer and is more immersive, at the cost of a model per building and a heavier screen. The overlay keeps the refs' readability.
- **Plots with light adjacency** (research recommendation: board-game simple, auto roads) — not chosen; free grid placement is more expressive and needs road and clearance rules and a richer placement UI.
- **Bases only from vessel parts (KSP1) or only from the building system** — the owner chose both.

## Consequences

- **Save format:** sites, buildings and the terrain seed are world data (format 5 for the site list; buildings additively when plan 090 lands, or with a bump and migration if a field becomes required).
- **Core and renderer:** `createTerrainField` takes a seed and a flat-zone list; the biome map cache is per world, not per site (plan 084). The planet and moon passes read the same zones. ADR 0043's "built around one site" and ADR 0030's fixed site become the Legacy defaults.
- **Mod API:** `defineBuilding`, a site-template registry (`defineSiteTemplate`), body rules for allowed buildings (additive).
- **Performance (ADR 0053):** the Space Center view gets its own measured budget at refinement (draw calls, `high` and `medium` frame time at the reference camera); buildings are instanced and simplified by distance; the flight view near the pad must stay within its current budget.
- **Physics:** buildings have no colliders at first (as today's site); pads are placement points.
- Follow-ups: plans 084, 090, 091, 092, 094, 096, 127 (range safety), 128 (bases); draft 063 (aeroplanes) uses the Runway building.

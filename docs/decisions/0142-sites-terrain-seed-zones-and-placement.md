# 0142 — Sites: the terrain seed, flat zones from sites, and placement at a pad

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [084](../plans/084-sites-in-the-world-terrain-seed-and-flat-zones.md)
**Builds on:** ADR 0097 points 1 and 2 (sites are world data; terrain per world), ADR 0043 (one height function in core, GLSL twin), ADR 0030 (launch site), ADR 0072 (lakes), ADR 0110 (`WorldInfo.sites`)

## Context

Today one launch site at (0, 0) shapes the whole home planet: the biome map clears grassland around it, the height function is exactly zero within 5 km of it and blends out over 11 km, a scenic massif rings it 12 to 44 km out, and lakes keep 30 to 80 km away from it. The renderer bakes the same function on the GPU from `uSiteDir`. ADR 0097 point 2 makes the terrain a function of the world seed with flat zones from a list of sites, and the Legacy world must reproduce today's heights exactly. Open points: what a `Site` holds now, where the terrain seed comes from, which of the four site effects follow every zone and which only the primary site, how many zones the GPU takes, and how the sim places a vessel at a site.

## Decision

1. **`Site` (core type and schema):** `{ id, name, body, kind: 'space-center' | 'base' | 'outpost', latitude, longitude (rad, body-fixed), flatRadius, blendWidth (m), pads: [{ east, north }] (m from the site centre, on the tangent plane) }`. Buildings (090) and member vessels (ADR 0097 point 7) come with their plans as optional fields. `WorldInfo.sites` is `Site[]`; the **Legacy site** is `{ id: 'legacy', name: 'Space Center', body: 'stock.home', kind: 'space-center', latitude 0, longitude 0, flatRadius 5 000, blendWidth 11 000, pads: [{ east: 0, north: 0 }] }`. A world whose `sites` is empty (every format-5 save written before this plan) uses the Legacy site; nothing is rewritten, so old saves keep their bytes and checksum.
2. **Terrain seed.** The home terrain's seed is `20 261 016` (today's map seed) for the Legacy world and the world's `seed` otherwise (`terrainSeedOf(worldInfo)`). The seed drives the biome map generator (in place of the constant) and a **lattice shift** of the value noise of heights, warp and lakes: `shift = (seed − 20 261 016) × 2 654 435 761 mod 2^16`, added to the integer lattice coordinates. The Legacy shift is 0, so every hash is today's hash.
3. **Zones.** A zone is `{ latitude, longitude, flatRadius, blendWidth }`, made from the sites on the body. Every zone flattens: the site weight is the **product** of `smoothstep(flatRadius, flatRadius + blendWidth, arc)` over the zones; every zone clears grassland on the biome map (the largest clearing weight wins); every zone keeps lakes away (the lake gate is the **minimum** over zones). The scenic massif rings only the **first** zone (the primary site, the Space Center). With one zone each rule is today's formula, so the Legacy world is bit-identical.
4. **At most 8 zones on a body** (`MAX_TERRAIN_ZONES`): the GLSL twin takes them as a uniform array of 8 (`vec4` direction and flat radius, plus the blend width) and a count, so a shader has one fixed loop. A world with more sites on one body is refused when it is created (087/092 enforce it; core throws).
5. **Placement.** `load-vessel` takes `placement: { kind: 'site', site, pad? }`; the sim resolves the site's centre plus the pad's east/north offset to latitude and longitude on the site's body and calls the existing `placeOnSurface`. Pad 0 of the Legacy site is exactly today's default placement.
6. **The sim's terrain factory** gets the world: `createSim({ terrain })` with a function is called as `terrain(body, { seed, zones })`, where the zones are the sites on that body. A factory that ignores the second argument keeps working (one-argument functions in tests).

## Alternatives considered

- **A massif around every site** — rejected: a base would sit in a ring of 3.7 km peaks by default; the ring is the Space Center's scenery (ADR 0030).
- **Rewrite empty `sites` to the Legacy site on read** — rejected: it changes the bytes a save is signed over (journal 077), for no gain over a resolving function.
- **A texture of zones for the GPU** — rejected at 8 zones: a uniform array is simpler, and the count is a world-creation limit.

## Consequences

- `createTerrainField({ radius, seed?, zones? })` replaces `{ radius, latitude?, longitude? }`; the defaults are the Legacy seed and zone. `cachedPlanetMap` is keyed by width, seed and the zones' clearing.
- Plans 090 (buildings) and 092 (site choice) extend `Site`; 092 resolves location templates against the terrain seed; 127 (range safety) uses the site's position.

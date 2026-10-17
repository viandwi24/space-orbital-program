# 0177 — Site templates: criteria, the resolver, consequences and founding a site

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 092
**Builds on:** ADR 0097 point 6 (site choice, location templates, consequences), 0142 (sites, terrain seed, zones, placement), 0115 (buildings, the Legacy layout), 0143 (Create World).

## Context

The player picks the primary site at world creation, on the globe or from templates such as "equatorial coast" that resolve to a concrete flat spot on that world's terrain. Open: what a template says, how a spot is found deterministically and at bounded cost, what the "consequences" are as numbers, and how a site founded later fits the rule that terrain zones are fixed when the sim is created.

## Decision

1. **Template.** `defineSiteTemplate({ id, label, description?, criteria })`, registry kind `site-template`. Criteria: `absLatitude: [min, max]` (rad, both hemispheres), and optionally `seaEast` (sea within `seaDistance` m to the east), `inland` (no sea within `seaDistance` in eight directions), `island` (sea within `seaDistance` in the four cardinal directions), `minElevation` (biome map elevation 0..1). `seaDistance` defaults to 300 km. Stock: equatorial coast, mid-latitude coast, inland plateau, high latitude, island.
2. **What the resolver reads.** The biome map of the world's terrain seed generated **without zones**, because a zone clears its spot to grass and would hide every coast. It is read at the warped coordinates the terrain itself uses (`warpedLatLon`, `sampleMap`). Land is elevation ≥ `landFull`, sea is < `landStart` (the terrain's own coast margins). A spot is acceptable when it and eight points 8 km around it are land, so the whole flat radius stands on land.
3. **Search.** A coarse grid of 1° latitude × 2° longitude over the band in both hemispheres, then a 0.1° refinement around the best cell. Score (lower is better): distance from the middle of the band × 4, plus |longitude| / π. Ties keep the first, so the result depends only on the seed. When no spot meets every criterion, soft criteria are dropped in the order `island`, `seaEast`, `inland`, `minElevation`, and the result names them in `relaxed`. The band and land are never dropped. Cost on Agent 3's machine: about 1 s to make a seed's map once (cached), then 30–300 ms per template.
4. **Consequences** (`siteConsequences`): rotation boost `ω R cos φ` (m/s), lowest inclination `|φ|`, downrange east (25 km samples to 1 000 km: all `sea`, all `land`, or `mixed`), and the great-circle distance to the nearest other site on the body (null without one).
5. **Create World.** The site choice is "Default (0°, 0°)" or a template. The default keeps `sites` empty, so the world gets the Legacy site (ADR 0142 point 1) and 087's behaviour stays as it is. A template writes the resolved site as the first site: kind `space-center`, the Legacy flat radius, blend and pad, and the Legacy layout of buildings.
6. **Founding later.** `found-site { id, name, latitude, longitude, body? }` adds a `base` with the starter layout (the Legacy pad only). It is refused beyond `MAX_TERRAIN_ZONES` sites on the body, or when its flat zone and blend would overlap another site's (distance < the two `flatRadius + blendWidth` summed). Terrain zones are built at `createSim` (ADR 0142 point 6), so the new site shapes the ground from the next load. A `site` placement at a site founded in this run is refused until then, with the reason. Cost and build time arrive with plan 096. The event is `site:founded`.

## Alternatives considered

- **Resolve on the zoned map** — rejected: every candidate would look like grassland.
- **Random spot per seed** — rejected: the criteria would then be a filter on luck. A fixed preference keeps "equatorial coast" meaning the same thing on every world.
- **Rebuild the terrain field when a site is founded** — deferred: the renderer and the sim build their fields at load, and plan 096 brings construction time anyway.

## Consequences

- **Mod API:** `defineSiteTemplate`, `ctx.siteTemplates`, `resolveSiteTemplate`, `siteConsequences`; additive, `API_VERSION` patch bump. Load report kind `site-template`.
- **Protocol:** `found-site`, `site:founded`. The web `CreateWorldInput` gains `site`.

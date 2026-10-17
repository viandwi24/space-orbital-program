---
id: 092
title: "Site choice at world creation and location templates"
status: in-progress
owner: "Agent 3"
depends: [084, 087, 090]
phase: 5
created: 2026-10-17
updated: 2026-10-17
---

# 092 — Site choice at world creation and location templates

## Goal

Create World lets the player choose the primary site on a globe or from location templates (for example equatorial coast, mid-latitude coast, inland plateau, high latitude, island), each resolved against the world seed to a concrete flat spot, with its consequences shown (rotation boost, lowest inclination, downrange over sea or land, nearest recovery); in Career a second site can be founded later.

## Context

- ADRs: 0097 point 6, 0142 (sites, terrain seed, zones, placement), 0115 (buildings, the Legacy layout), 0143 (Create World), 0177 (written in step 1: template criteria, resolver, consequences, founding).
- Read: `refs/reverse-engineering-ksp2/beyond/08-space-center-building-and-colonies.md` §4, `packages/core/src/sites.ts`, `planet-map.ts` (`generatePlanetMap`, `sampleMap`, `SEA_LEVEL`), `terrain.ts` (`createTerrainField`, `latLonDirection`), `apps/web/src/lib/worlds/world-model.ts` (`createWorldInfo`), `CreateWorld.svelte` and its test, `packages/sim/src/buildings.ts` (`placeBuilding`), `LEGACY_LAYOUT`.

## Scope

**In:**
- `defineSiteTemplate({ id, label, description?, criteria })` (registry kind `site-template`). Criteria: `absLatitude: [min, max]` (rad), optional `seaEast` (sea within `seaDistance` m east: launches downrange over water), `inland` (no sea within `seaDistance` in eight directions), `island` (sea within `seaDistance` in the four cardinal directions), `minElevation` (biome map elevation 0..1). Stock templates: equatorial coast, mid-latitude coast, inland plateau, high latitude, island.
- `resolveSiteTemplate(template, { seed, radius })`: reads the biome map of the world's terrain seed without any zone, scans a coarse grid (1° latitude × 2° longitude in the band), keeps land whose flat radius is all land, scores by the criteria, refines around the best at 0.1°, and returns `{ latitude, longitude, relaxed }`. When no spot meets every criterion, the soft ones are dropped in the order `island`, `seaEast`/`inland`, `minElevation`, and `relaxed` names them; the latitude band and land are kept. Deterministic from the seed; its cost is measured.
- `siteConsequences(site, body, seed)`: rotation boost `ω R cos φ`, lowest inclination `|φ|`, downrange east over `sea`, `land` or `mixed` (samples to 1 000 km), and the distance to the nearest other site (null when none).
- Create World: a "Site" choice (Default 0°, 0°, or a template), with the resolved coordinates and the consequences shown; `createWorldInfo` writes the chosen site as the world's first site (a space center with the Legacy layout). The default keeps `sites` empty, so 087's behaviour is unchanged.
- `found-site { id, name, latitude, longitude, body? }`: adds a `base` site with the starter layout (the Legacy pad), refused over `MAX_TERRAIN_ZONES` or when its flat zone overlaps another site's. Its flat zone shapes the terrain from the next load, and a `site` placement at it is refused until then. Free until 096.

**Out:** range safety (127), bases on other bodies (128); a 3D or map-projection globe picker (a list of templates plus latitude and longitude fields, with the map preview left to 089/091); abstract transfer of vessels and crew between sites (it needs site membership, ADR 0097 point 7: plan 128); cost and build time of a founded site (096).

## Touches

- **Size:** M
- **Edits:** `packages/core` (`site-templates.ts` new, `registry.ts`, `plugin.ts`, `definitions.ts`, `protocol.ts`, `protocol-schemas.ts`, `events.ts`, `version.ts`, `index.ts`), `packages/sdk`, `mods/stock` (templates, tests), `packages/sim` (`sites.ts` or `buildings.ts`, `commands.ts`, tests), `apps/web/src/lib/worlds` (`world-model.ts`, `CreateWorld.svelte`, tests), `docs/architecture/simulation.md`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** **SDK (`defineSiteTemplate`, `ctx.siteTemplates`, `resolveSiteTemplate`, `siteConsequences`; `API_VERSION` patch bump), protocol (`found-site`, event `site:founded`), load report kind `site-template`; `CreateWorldInput.site` (web)**

## Design notes

The resolver is deterministic from the seed so the same world gets the same spot; its search cost is bounded (a coarse grid then refine) and measured.

## Steps

1. ADR 0177; templates, resolver and consequences in core, with tests (20 seeds, timing).
2. Stock templates; SDK.
3. Create World site choice and `createWorldInfo`, with vitest.
4. `found-site` with sim tests.

## Acceptance criteria

- [ ] `bun test mods/stock/test/site-templates.test.ts`: for 20 seeds every stock template resolves to a spot whose flat-zone height variance (terrain field of that seed with the zone, 64 points inside the flat radius) is under 1 m and whose |latitude| is inside the template band; the same seed gives the same spot; the resolve time per template is printed (indicative).
- [ ] `bun test packages/core/test/site-templates.test.ts`: the rotation boost at latitude φ equals ω R cos φ within 1e-9 (stock home body); the lowest inclination is |φ|; downrange classification on a synthetic map.
- [ ] `bunx vitest run src/lib/worlds` (apps/web): choosing a template in Create World shows its consequences, and `createWorldInfo` with that choice gives a world whose first site has the resolved coordinates; the default choice keeps `sites` empty.
- [ ] `bun test packages/sim/test/sites.test.ts` (new cases): `found-site` adds a base with the starter pad, refuses an overlapping zone and a ninth site, and a `site` placement at a site founded in this run is refused until a reload.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/092-site-choice-and-location-templates.md` written.
- [ ] `guides/writing-a-mod.md` (site templates).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097).
- 2026-10-17 — Refined and claimed by Agent 3. The globe picker is a template list plus latitude and longitude fields with the consequences panel (a map preview is left to the menu and Space Center plans). The abstract transfer between sites moves to 128, which brings site membership. The resolver reads the biome map without zones, because zones clear the map to grass. A founded site's flat zone applies from the next load, because terrain is built at `createSim`. Design choices go in ADR 0177.
- 2026-10-17 — Deviation: the 20-seed test is `packages/sim/test/site-templates.test.ts`, not under `mods/stock/test`, because `mods/stock` has no dependency on `@orbital/core` (the terrain field), as in 079.
- 2026-10-17 — Implemented as refined. The inland plateau relaxes `inland` on 6 of the 20 test seeds; the slowest first resolve (map build included) is 1.2 s.
- 2026-10-17 — Handed over as `ready/092`; the handover text is the tag message.
- 2026-10-17 — Merge by Agent 1 (M5): rebased on `main` @ b557b4c (clean, after 068); `API_VERSION` 0.1.39 is `main` + 1. `bun run test` 1480 pass, 0 fail · web vitest 105 files, 917 passed · typecheck exit 0 · build exit 0 · docs:check OK · Chromium `smoke.e2e.ts` + `worlds.e2e.ts` 7 passed (2.9m).

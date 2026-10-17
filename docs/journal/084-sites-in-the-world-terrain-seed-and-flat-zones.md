# 084 — Sites in the world: a terrain seed per world and a list of flat zones

**Plan:** [plans/084-sites-in-the-world-terrain-seed-and-flat-zones.md](../plans/084-sites-in-the-world-terrain-seed-and-flat-zones.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-17 · **ADRs:** [0142](../decisions/0142-sites-terrain-seed-zones-and-placement.md) (new), [0097](../decisions/0097-sites-space-center-in-3d-free-grid-bases-and-range-safety.md), [0043](../decisions/0043-physical-terrain-one-height-function-in-core.md), [0030](../decisions/0030-launch-site-coordinates-and-ground-detail.md) · **Research:** none (no tool or API looked up)

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `core/test/fixtures/terrain-legacy.json`, `terrain-legacy.test.ts` | step 1, before any change: 10 000 directions (seeded, half within 120 km of the pad), their heights and lake levels as float64 SHA-256 plus 200 raw heights, and the biome map SHA-256 at 256, 512, 1024 |
| `core/src/terrain.ts` | `TerrainZone`, `LEGACY_ZONE`, `MAX_TERRAIN_ZONES` (8), `terrainShift(seed)`, `checkTerrainZones`; `terrainNoise` takes the shift; `TerrainContext.zones`/`shift` (the old `siteDirection` still works); the height function multiplies the zones' flat weights, takes the lake gate's minimum and rings the first zone with the massif; `createTerrainField({ radius, seed?, zones? })` |
| `core/src/planet-map.ts` | `LEGACY_TERRAIN_SEED`; `generatePlanetMap`/`cachedPlanetMap(width, { seed, zones })` clear grassland around every zone (the nearest wins) |
| `core/src/sites.ts` | `Site`/`siteSchema`, `LEGACY_SITE`, `sitesOf`, `terrainSeedOf`, `zonesOf`, `padLatLon`; `WorldInfo.sites: Site[]` |
| `core/src/body-terrain.ts`, `protocol*.ts`, `version.ts` | `createBodyTerrainField(body, world?)`; placement `{ kind: 'site', site, pad? }`; `API_VERSION` 0.1.32 (095 and 081 took 0.1.30 and 0.1.31) |
| `sim/src/bodies.ts`, `sim.ts`, `commands.ts` | the terrain factory is called with the world's seed and the zones of the sites on each body (`TerrainFactory`); `load-vessel` at a site's pad |
| `renderer` | `terrainZonesGLSL` (`uZones[8]`, `uZoneBlend[8]`, `uZoneCount`), `uTerrainShift` in `noiseT`, one shared set of zone uniforms for the planet pass and both bakes (`terrain-zones.ts`), the planet pass's lake gate over the zones, `PlanetPass.setTerrain`, `Environment.setTerrain`, `RendererConfig.terrain`, debug `setTerrain` and `terrainHeightAt` |
| `apps/web` | the sim's `ready` carries `terrain` and `launchSite` (`sim-host.ts` `worldTerrainOf`); `flight-loop.ts` passes them to `createRenderer`; `e2e/terrain-parity.e2e.ts` (dev build only) |

## What surprised me

- **The site shapes four things, not one.** The flat zone is the obvious one; the biome map's grass clearing (0.08 to 0.2 rad, about 50 to 120 km), the scenic massif ring (12 to 44 km) and the lake gate (30 to 80 km) also follow the launch site. ADR 0142 point 3 decides which follow every zone (flat, clearing, lakes) and which only the primary site (the massif). One consequence the zone test had to respect: a second zone changes the terrain well beyond its own rim (the clearing and the lake gate), so "blends to the noise at its rim" is checked against the same world with that zone 1 m wide, not against the world without it.
- **Legacy bit-identity came cheaply** because every new rule is the old formula for one zone: a product of one weight, a minimum of one gate, a lattice shift of 0, and the same seed constants.
- **The renderer no longer locked the site from the first vessel** (`SceneModel.lockLaunchSite`, still named in `overview.md`): it already took `launchSite` from its config, default (0, 0). The overview now says where the site and the zones come from.
- Two renderer tests pinned the bake programs' text (plan 059's SHA-256, and the site constants in the GLSL); they now pin the zone uniforms and the new hashes on purpose.
- `bun test ... mods` (without `./`) also matches `apps/web/src/lib/mods` and runs those vitest files under Bun; use `./mods`.

## Decisions made

- [ADR 0142](../decisions/0142-sites-terrain-seed-zones-and-placement.md): `Site` shape, Legacy site for worlds without sites, terrain seed per world with a lattice shift that is 0 for Legacy, which effects follow every zone, 8 zones on the GPU, placement at a pad, the terrain factory gets the world.

## Renderer parity (plan 031 method)

Development build (`NODE_ENV=development bun run build`), `scripts/serve.ts` on port 5211, Playwright Chromium (SwiftShader, headless), two-stage vessel on the pad, `__orbital.renderer().debug`. 1 000 texels per patch, the same texels for both runs, GPU float32 against `terrainHeightAt` (core, float64):

| Terrain | fine mean / worst (m) | mid mean / worst (m) | heights inside the second zone (mid) |
|---|---|---|---|
| Legacy (one zone) | 0 / 0 | 0.130 / 1.304 | up to 45.7 m (10 texels) |
| Legacy + zone 6 km east (1.5 km flat, 3 km blend) | 0 / 0 | 0.132 / 1.304 | 0 (10 texels) |

The fine patch lies inside the pad's flat zone (all zero). SwiftShader's worst mid texel (1.30 m) is above the 0.806 m of journal 031 on the M5 GPU, for both terrains alike: the zones add no error. The test (`e2e/terrain-parity.e2e.ts`, skipped unless `E2E_DEV_HOOKS=1`) asserts exactly that, plus the flat second zone on the GPU; Agent 1 may rerun it on the M5 in the visible pane for the journal 031 bound itself.

## Open questions / follow-ups

- Plan 092 (site choice) writes sites and must keep a body at 8 or fewer; 090 adds buildings to `Site`; 087 writes a world's sites at creation (the Legacy site for a quick start).
- The moon pass's `hills` bodies keep the Legacy zone (a second hills planet has no site yet); when bases on other bodies arrive (ADR 0097 point 7), the moon pass needs the same zone uniforms per body.

## Verification output

See the plan's Log.

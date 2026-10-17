# 059 — Hills terrain on a body other than the first

**Plan:** plans/059-hills-terrain-on-a-second-body.md · **Session(s):** second-planet session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0090](../decisions/0090-hills-on-a-second-body-in-the-ground-pass.md) · **Follow-up draft:** [071](../plans/071-atmosphere-and-sea-on-a-second-planet.md)

## What was done

| Where | What |
|---|---|
| `renderer/src/shaders/terrain.glsl.ts` | `heightAt` and its noise moved out of `terrainBakeCommon` into the exported `terrainHeightGLSL`; the planet pass's three bake strings are byte-identical (sha256 pinned in a test) |
| `renderer/src/shaders/moon.glsl.ts` | bake fragments built by `cubeFragmentOf` / `patchFragmentOf(height)` (`uRadius` declared before the height function); `hillsHeightGLSL` (the planet's `heightAt` with the map's elevation read by hand-made bilinear); hills vertex tail (slope varying), fragment colour from the biome map (ocean, lakes, beach, grass, forest, desert, rock, snow), grain bump |
| `renderer/src/moon-model.ts`, `moon.ts` | `GroundKind`, `GROUND_SPECS` (cube 1024 / 512, globe detail 96 / 64, skirt 160 / 40 m, bake distance 8 / 40 radii, cube released beyond twice that for hills only); `MoonPass` takes `kind`, builds the biome texture, bakes the hills function, switches shadows and stones off, culls the globe by a true bounding sphere |
| `renderer/src/scene.ts` | a body after the first with `terrain.kind` `hills` gets the pass; the vessel's terrain light is the craters' only |
| tests | `renderer/test/hills-ground.test.ts` (11, new), `moon.test.ts` (the old "hills stays a sphere" test now says the opposite), `sim/test/terrain-kind.test.ts` (+4: a lander on a gentle and a 30 degree hillside of a hills body, without and with an atmosphere) |
| docs | ADR 0090, draft 071, `writing-a-mod.md`, `architecture/overview.md`, STATUS |

No core, sim or API change (API stays 0.1.23): `createBodyTerrainField` already gave a `hills` body the home planet's field at its own radius; only the picture was missing.

## Method of the numbers

A clean copy of HEAD (4de52a7, `git archive` plus `bun install --frozen-lockfile`) in the scratchpad, built as production with `NODE_ENV=development vite build` (so `__orbital` exists), served by a copy of `apps/web/scripts/serve.ts` with a save endpoint (`serve59.ts`, scratch only); built-in browser pane, one tab, one server, both closed at the end; canvas forced to 1920 x 1080 ratio 1, rAF stubbed, synthetic snapshots (the live pad snapshot with the vessel put on a body at a latitude/longitude and the body turned so the sun is where I want it), `setPlanetScale(1)`, `setRenderScale(1)`, sync frame = mean of 8 `debug.benchmark(1)`, value = minimum over 2 windows. Three builds: HEAD, this change on the stock mod, and this change with a scratch stock mod that adds two hills planets (`stock.rock`, 420 km, airless; `stock.mist`, 250 km, atmosphere 20 kPa, 40 km high). The machine runs warm today: the pad is 18 to 19 ms on `high` on HEAD too (13.7 on journal 052's hour), so only same-hour comparisons mean anything. The pane's other tab (another session's) was left alone; I closed mine.

## GPU against float64 (600 texels per patch, `Renderer.debug.readMoonPatch`)

| Body | Place | Fine worst / mean (m) | Mid worst / mean (m) |
|---|---|---|---|
| rock (420 km) | flat zone (fine span is inside it: all zero) | 0 / 0 | 0.099 / 0.018 |
| rock | hillside 2 640 m, slope 0.38 | 0.005 / 0.001 | 0.134 / 0.007 |
| rock | massif ring 3 080 m | 0.022 / 0.002 | 0.103 / 0.014 |
| mist (250 km, atmosphere) | flat zone | 0 / 0 | 0.047 / 0.007 |
| mist | hillside 2 030 m | 0.013 / 0.003 | 0.033 / 0.003 |
| mist | massif ring 3 100 m | 0.013 / 0.002 | 0.056 / 0.008 |

The first run, with the planet pass's hardware-filtered biome fetch, gave the same fine numbers but the mist mid patch off by 13.1 m worst (mean 0.54 and 1.2 m): the 8-bit weights of the texture filter, where the land mask rises over a few texels of the 3.7 km map (a coast), times 3.7 km of relief. The ground pass now reads the elevation with four `texelFetch` and a float mix (the twin of `sampleMap`): 0.056 m. The home planet's bake keeps its filtered fetch (ADR 0044's measured mid bound there is 0.81 m, and its bytes are pinned).

## A lander on it (the real sim, `load-vessel` on the scratch mod)

The two-stage example placed at latitude 0, longitude 0.046 of `stock.rock` (528 m high, slope 0.022); after 9 s it is `on-rails` (at rest), `terrainHeight` 528.219 m, altitude 535.72 m (the root part sits 7.5 m up the stack), and the renderer draws the ground under it from the baked fine patch (the patch centre is the lander's longitude): `assets/059-second-planet-lander-on-hills.jpg`. The sim tests put a pod on the 0.6 percent slope 42 km out (within 0.05 m of the field) and on the 30 degree one 30 km out (a few decimetres of slide), with and without an atmosphere.

## Frame times (sync ms, M5, `high` / `medium` / `low`)

| Scene | HEAD (round 2) | this, stock mod (round 1 / round 2) |
|---|---|---|
| pad | 19.38 / 14.25 / 8.60 | 18.69 / 14.61 / 8.30 and 18.52 / 14.34 / 8.61 |
| moon plain, sun 35 degrees | 6.21 / 6.27 / 3.89 | 5.71 / 5.67 / 3.90 and 6.85 / 5.89 / 3.98 |
| crater site, sun 7 degrees | 11.16 / 10.41 / 6.94 | 11.21 / 10.00 / 7.07 and 11.20 / 10.01 / 6.85 |

(HEAD round 1, taken before I fixed the pad camera of the harness: 15.57 / 12.46 / 9.00, 6.56 / 6.29 / 4.44, 10.99 / 9.10 / 6.42; same order of size.) Differences stay under the 0.6 ms the same build shows between rounds; the pad is not touched by this plan.

Second body (scratch mod, same page and hour as a pad of 17.3 `high`, 12.2 `medium`, 8.9 `low`):

| Scene | `high` | `medium` | `low` |
|---|---|---|---|
| rock flat zone, sun 35 | 6.68 | 6.94 | 4.56 |
| rock hillside (2 640 m, sun 30) | 7.46 | 7.44 | 5.27 |
| rock massif ring (3 080 m) | 6.91 | 6.97 | 4.63 |
| mist flat zone (atmosphere) | n/m | n/m | 4.88 |
| mist massif ring | 6.40 | 6.52 | 4.95 |
| rock from orbit, the globe filling a third of the view | 6.23 | 6.16 | 4.09 |
| mist from orbit | 5.16 | 5.93 | 4.07 |

The cube's six faces bake one per frame: 13.5 ms the first frame, then 10.3, 9.8, 8, 7.6, 8.3 against 6 to 8 ms steady.

## Screenshots (1920 x 1080, `high`)

`assets/059-second-planet-from-orbit.jpg` (the 420 km body, sun high over its flat zone: continents, sea, shores, lakes, snow), `059-second-planet-with-atmosphere-from-orbit.jpg` (the 250 km body whose definition has an atmosphere, drawn the same way), `059-second-planet-lander-on-hills.jpg`, `059-second-planet-hillside.jpg` (a rock slope at 2 640 m, a pod and its shadow), `059-second-planet-snow-massif.jpg` (the massif ring above the snow line: white, overexposed: the exposure is by sun elevation only, ADR 0058).

## What surprised me

- **The harness is the hard part of "unchanged".** A pixel diff of HEAD against this change on the pad and the moon was the draft's criterion. Two boots of the same build differ by 5 to 10 of 255 on the pad (grass, steam and clouds run on the renderer's own clock) and by 0.1 to 0.3 on the moon, and across boots the camera heading differed by tens of degrees although the snapshot, body rotation and rig are fixed in the harness; I could not find why in the time (the vessel's orientation and `t` are overridden). The cross-build diff measured 39 (pad) and 10 (moon), which is the harness. Replaced, with a reason in the plan Log, by evidence that does not need identical frames: the planet pass's bake strings are byte-identical (and a one-space change to `terrainHeightGLSL` fails the test, shown), the craters path only gained branches (`git diff packages/renderer/src/moon.ts`), and interleaved frame times agree.
- **`setActiveVessel(8)` made my first parity run read the lander's patch for every scene** (the synthetic snapshot moves vessel 0, the active one was 8). Caught because the patch centre did not move between scenes.
- **A 600 km body with a 512 cube is too coarse**: ADR 0044's table (a 920 m texel is off by 13 to 27 m on average, 75 to 124 m at worst) is why hills bodies bake 1024 and why the skirt is 160 m, not 40.
- **The hills function is the first thing in the moon pass that depends on the map texture**, so the biome map's CPU cache (`cachedPlanetMap`, 0.3 s) is built at scene construction when a hills body exists; the first `groundHeight` query reuses it.
- Hills colours from orbit are right (continents, coasts, the lake blobs) but the beach ring reads as a white rim at far range; snow takes large areas at the poles.
- The grass bump (2.5 m term) shows a faint moire pattern under a low sun at 10 to 60 m; a stochastic detail would be better, left for 071.

## Decisions made

ADR 0090: a second ground kind in the moon pass (not a second planet pass); the cube map follows the camera (bake within 8 radii, release beyond 16, hills only); hills shading is biome colours with no terrain shadows or stones; atmosphere optional in the definition and not drawn; hills bodies share the home planet's map and site (draft 071 for `seed`, `site`, sky, sea, shadows).

## Open questions / follow-ups

- Draft [071](../plans/071-atmosphere-and-sea-on-a-second-planet.md): sky and haze on a second planet with an atmosphere, water shading, `seed`/`site` on `hills`, terrain-cast shadows on hills.
- Not measured on M1/M2, Intel or a phone-class GPU: the 1024 cube bake and the 4 `texelFetch` per height evaluation are by M5 cost.
- A mod with many hills bodies near each other holds one 50 MB cube per body within 8 radii of the camera; a cap is not implemented.
- A person should look at the grass colour on a lit hillside at noon and at the sunset terminator from orbit.

## Verification output

- `bun test packages/renderer`: 558 pass, 0 fail. `bun run test`: 1 269 pass, 0 fail. Web vitest: 91 files, 819 tests pass.
- `bun run typecheck`: all packages and `svelte-check` 0 errors. `bun run build`: done. `bun run docs:check`: OK.
- Guards shown to bite: hills `releaseCube: true` to `false` fails "gives it back beyond 16"; one extra space in `terrainHeightGLSL` fails the pinned bake hashes; both restored.
- Processes: the scratch server was killed (process list checked), the browser tab closed.

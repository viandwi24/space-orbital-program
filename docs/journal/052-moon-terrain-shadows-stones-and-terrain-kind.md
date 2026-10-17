# 052 — Moon terrain shadows, stones as geometry, terrain kind per body

**Plan:** plans/052-moon-terrain-shadows-stones-and-terrain-kind.md · **Session(s):** moon-detail session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0067](../decisions/0067-terrain-kind-per-body.md), [0068](../decisions/0068-terrain-shadows-and-stones-on-the-moon.md) · **Research:** [terrain-shadows-and-stones.md](../research/terrain-shadows-and-stones.md)

## What was done

| Where | What |
|---|---|
| `core/src/schemas.ts`, `body-terrain.ts` (new), `moon-terrain.ts`, `index.ts`, `version.ts` | `BodyDefinition.terrain` (`hills`, `craters` with a seed 0 to 999), `createBodyTerrainField`, `terrainKindOf`, `cratersSeedOf`; the crater function takes a seed (`moonHeight(n, radius, seed)`, salts shifted by 977 x seed); API 0.1.18 |
| `mods/stock/src/bodies.ts` | the home planet says `hills`, the moon `craters` |
| `apps/web/src/lib/sim.worker.ts`, `flight-loop.ts`, `sim/test/soi.test.ts`, `sim/test/release-saves.tool.ts` | the three "has a parent" guesses replaced by `createBodyTerrainField` / the kind; the page's body list for the renderer carries `terrain` (it had been rebuilt field by field and dropped it) |
| `renderer/src/terrain-shadow.ts` (new) | the march (constants, step spacing, soft edge, bias, skip at a high sun) in float64, the CPU twin of the shader and what the active vessel uses |
| `renderer/src/shaders/moon.glsl.ts`, `moon.ts` | the march in the patch and stone shaders (uniform step count by preset, the sun visibility on the colour of the directional light only), the seed in the bake shaders, the stone lattice as domes in the ground bump, stone vertex/normal/colour pieces, the stones' depth material |
| `renderer/src/stones-model.ts`, `moon-stones.ts` (new) | the lattice (cube-face chart, hashes of `(face, i, j)`), `stonesAround`, two instanced rock meshes |
| `renderer/src/scene.ts`, `renderer.ts` | the moon pass by `terrain.kind` (not by atmosphere), the sun direction and the vessel's terrain light per frame, shadow steps by preset, `Renderer.debug.setMoonDetail` |
| tests | `core/test/body-terrain.test.ts` (5), `stock/test/boot.test.ts` (+1), `sim/test/terrain-kind.test.ts` (2), `renderer/test/terrain-shadow.test.ts` (9), `stones.test.ts` (10), `moon.test.ts` (+5) |

## Method of the numbers

Another session's plan 054 (light shafts, ozone) sits uncommitted in `planet.ts`, `atmosphere-model.ts`, `presets.ts` and the planet shaders, and a first build copied everything modified under `packages/renderer`: its half-edited planet shader failed to compile (`CLOUD_THICK` undeclared) and drew no sky or ground at the pad. Every number below is from a build of a clean copy of HEAD (`git archive HEAD` in the scratchpad) plus only the files of this plan (`sync52.sh` lists them); the earlier numbers were thrown away. Baseline is the same protocol on a second clean copy of HEAD. Production build (`NODE_ENV=development vite build`, so `__orbital` exists), a small Bun static server on 5220 (one server, one tab, both closed afterwards), built-in browser pane, canvas forced to 1920 x 1080 ratio 1, rAF stubbed, `setPlanetScale(1)`, `setRenderScale(1)`, a warm-up pass over all three presets first (the first visit to a preset ran 2x slower: shader compiles in the hidden pane, as journal 050 found), sync frame = mean of 8 `debug.benchmark(1)`, value = minimum over 3 windows. The moon scenes are synthetic snapshots: the live pad snapshot with the vessel moved to a moon-relative spot, the moon's rotation chosen so the star is at the wanted elevation and azimuth there, the vessel 3 m above the ground height read from `moonHeight`.

## Frame times (sync ms, M5, `high` / `medium` / `low`)

| Scene | HEAD | this plan |
|---|---|---|
| pad | 14.02 / 11.14 / 7.05 | 13.68 / 10.84 / 8.89 (earlier run 6.80) |
| moon plain, sun 35 degrees (no march) | 4.85 / 4.73 / 3.16 | 5.07 / 5.18 / 4.09 (earlier 3.35) |
| moon plain, sun 7 degrees | 4.94 / 4.85 / 3.16 | 6.80 / 6.15 / 4.76 |
| crater site, sun 7 degrees | 6.07 / 6.04 / 4.16 | 9.66 / 8.64 / 6.01 |

The worst case is the crater site at a low sun, where every ground fragment marches: +3.6 ms `high`, +2.6 `medium`, +1.9 `low` (steps 24, 16, 10), 9.7 ms against the 14.4 of `high` (ADR 0053) and 8.6 against the 13.3 of `medium`. With the sun above 27 degrees the march is not run and the cost is the stones and the ground's new bump (0.2 to 0.5 ms). The stones alone are 0.3 to 0.4 ms (A/B with `setMoonDetail`). The `low` pad moved from 7.05 to 8.89 in one run and 6.80 in another: the machine is shared (another session's tab) and the pad code is untouched; I read both as noise, not as a change. Journal 050's moon surface was 6.15 `high` (a ground height of 3 420 m, own scene); the same kind of scene here is 4.85 on HEAD, so this machine hour is quicker than that one.

## GPU against the CPU twin

Three scenes (crater site, 3 degree sun; same site, 5 degree sun from another azimuth; a second crater site, 4 degree sun), 600 ground points each in the fine patch, screenshot with the shader's shadows on and off, the point's luma ratio against the CPU `terrainSunVisibility` at the same direction (the ambient floor taken from the CPU-shaded pixels; pixels that are dark in both images, because the slope faces away, are left out):

| Scene | pixels compared | shaded by CPU / by GPU | agree |
|---|---|---|---|
| a | 357 | 332 / 329 | 99.2 percent |
| b | 562 | 69 / 67 | 99.3 percent |
| c | 470 | 340 / 336 | 99.1 percent |

The disagreements are edge pixels of the penumbra (values near 0.5).

## Screenshots (1920 x 1080, `high`)

`assets/052-moon-low-sun-terrain-shadows.jpg` (sun 5 degrees over a crater site, shadows of rims and a ridge) and `052-moon-low-sun-shadows-off.jpg` (the same view with `setMoonDetail(false, true)`); `052-stones-near-lander.jpg` (the plain, sun 20 degrees, 16 m from the lander: stones with their own shadows). The low-sun shot has the regolith tint raised from 0.135 to 0.4 (`setMoonTint`, a look-development hook) because a 5 degree sun on the stock tint is almost black; the stones shot is the stock tint.

## What surprised me

- **`flight-loop.ts` rebuilds the body list for the renderer field by field** (`id, radius, mass, atmosphere, parent, orbit`) and dropped `terrain`: the first build drew the moon as a smooth sphere until I read the console. Anything added to `BodyDefinition` that the renderer needs has to be added there.
- **The stones were invisible at first**: their object space is the fine patch's local space (the mesh sits at the patch centre point); I had left them at the body's origin.
- **Shadow edges are quantised by the step spacing** (a cliff's shadow jumped from 0 to 1 with no partial values because the spacing at 300 m from the cliff is 75 m and the penumbra there is 25 m); a smooth ridge gives a soft edge. Reading `a = clearance / t` as the angle above the occluder makes the soft edge exact only where the spacing is finer than the penumbra (far rims, kilometres out).
- **Float32 on a 190 km body**: a chart coordinate in metres has 1.1 cm steps; stone domes read through it stippled at 10 m. The domes only appear beyond 34 m now (the pixel is 2 cm there) and the instances carry the near field. The march keeps millimetres by never subtracting two large numbers (`(|Q|^2 - R^2) / (|Q| + R)`).
- **The vessel is not drawn with the moon's shader.** Without the CPU twin a lander standing in a crater's shadow would be lit like the rim above it; scaling the sun light and dividing it out in the ground's shader keeps one `DirectionalLight` (at least 0.03 of the sun remains).
- **Parallel work in the renderer and in the ADR numbers**: 0066 is the script editor's and a plan 054 session reserved 0069 and 0070 in its code comments, so mine are 0067 and 0068 (stones and shadows share 0068).
- The Earth in the sky of the first moon screenshots disappeared in the build that had the other session's planet shader in it and came back with the clean copy.

## Decisions made

ADR 0067 (the terrain kind is data: `hills` or `craters` with a seed, one selection function; a mod picks a kind, not a function) and ADR 0068 (terrain shadows by a fragment march with the CPU twin for the vessel; stones as a world-fixed lattice drawn as instances and as bump domes; no collision).

## Open questions / follow-ups

- Draft [059](../plans/059-hills-terrain-on-a-second-body.md): a second body with `hills` is a sphere to the renderer.
- Draft [060](../plans/060-stones-with-collision.md): stones have no collision (a boulder is up to 1.5 m).
- Not measured on M1/M2, Intel or a phone-class GPU: the step counts per preset (24, 16, 10) are by M5 cost; if `low` still misses the budget on a weak GPU the shadow march is the first thing to cut (`SHADOW_STEPS`).
- The shadow edge of far rims is stepped (spacing 250 m at 2 km); a smaller exponent or more steps costs linearly.
- Stones near the face seams of the chart (190 km from the landing plain) are missing across a seam.
- A person should look at the stones' flat-shaded low-poly look and at how dark a 5 degree sun is on the stock tint (exposure is by sun elevation only, ADR 0058).

## Verification output

- `bun run test`: 1 019 pass, 1 fail. The failure is `preset-switch.test.ts` "progressive terrain bake" (expects 6 renders, gets 7): the planet pass of plan 054's uncommitted work adds a cloud-map bake render; not this plan (`planet.ts` is not touched here).
- `bun test packages/renderer` (all files), `packages/core`, `mods/stock`, `packages/sim` (moon landing and resume included): green apart from the line above.
- `bun run typecheck`: all packages and `svelte-check` 0 errors. `bun run build`: done. web vitest: 70 files, 620 tests pass. `bun run docs:check`: OK. `prettier --check .`: only `.claude/launch.json` (not this plan's).
- No terrain or pass choice by parent or atmosphere is left: `grep -rnE "body\.parent\s*\?|\.parent \? create|!b\.atmosphere" apps packages mods tools examples` finds nothing; the one rule left is `i > 0 && b.terrain?.kind === 'craters'` in `scene.ts` (the first body is the planet pass).

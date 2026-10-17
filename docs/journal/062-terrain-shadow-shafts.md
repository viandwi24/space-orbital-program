# 062 — Terrain shafts and the shared cloud-shadow map

**Plan:** plans/062-terrain-shadow-shafts.md · **Session:** shadows session (Claude, 2026-10-17), together with plan 056 · **ADRs:** [0089](../decisions/0089-terrain-cast-light-shafts.md), [0086](../decisions/0086-baked-cloud-map-shared-by-shafts-and-ground-shadows.md) · **Research:** [three.md](../research/three.md) (plans 056 and 062)

**Status when written: criteria met.** The cloud-map half is plan 056's (journal 056 has the method and the frame table). Not measured on M1/M2, Intel or a phone.

## What was done

| Where                                                   | What                                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `light-shaft.ts`, `test/light-shaft.test.ts`            | `SHAFT_TERRAIN`, `terrainReach`, `terrainReadDistance`, `terrainVisibility`, `combineOcclusion`; 6 new tests                                                                                                       |
| `shaders/planet.glsl.ts`, `planet.ts`, `presets.ts`     | `terrainShaftOcc` in the shaft march: `shaftTerrain` reads (high 4, medium 2, low 0) of the baked cube along the sun ray; combined with the cloud term; `SHAFT_TERRAIN` define; the march runs under clear sky too |
| `docs/journal/assets/062-{before,after}-ridge{3,6}.jpg` | `high`, sun 3 and 6 degrees behind the ridge of the hillside, camera toward it                                                                                                                                     |

## Method and the decision

Per journal 056. The decision was by measurement: the first build read the terrain with `terrainH` (cube map plus the camera-centred patches), three reads per sample: `medium` +2.2 ms facing the sun (11.5 to 13.7). The cube alone and two reads: +0.6 (12.08 against 11.47), `high` four reads +0.5 / +0.9. A sun-space shadow map was not built.

| Scene (sync, HEAD to this plan, minimum of pages) | `high`              | `medium`       |
| ------------------------------------------------- | ------------------- | -------------- |
| ridge, sun 3 degrees                              | 15.27 to 15.80      | 11.47 to 12.08 |
| ridge, sun 6 degrees                              | 15.24 to 16.10      | 11.58 to 12.00 |
| other scenes                                      | within -1.3 to +0.1 | within +0.16   |

## Look review

`062-before-ridge3.jpg` has the haze lit as if the hills were not there: a flat bright glow over everything. `062-after-ridge3.jpg` has the valley and the haze in front of the ridge in its shadow, a lit rim at the crest and a fan of paler bands to the right of the sun; 68 percent of the pixels are darker by 28 levels on average than the same build with `SHAFT_TERRAIN` 0. It reads like a real blue hour. Thin beams between peaks are not there: the hills of the home body are rolling, the reads are 1 km-scale and the penumbra is wide, so the effect is a shadow volume, not rays. A person should judge whether the blue-violet cast of the shadowed haze (the sky's own colour fills it, ADR 0070) is too cool.

## What surprised me

- The first build shaded the whole valley in front of a 3-degree sun, flat ground included: `terrainShadow`'s penumbra is a fixed 0.12 of the distance, but a ray at a low sun gains less height than that, so flat ground "blocked" it. Found by looking at the picture (it looked too dark, not wrong), then by reading the arithmetic; the penumbra is tied to the ray's own gain now and a test pins "flat ground never shadows at any sun height".
- The 4 and 33 km patches are not needed for a shadow of kilometres: dropping them from the reads cut the cost to a quarter.

## Not met / not done

- A sun-space shadow map (ADR 0089): only if a slower GPU needs it.
- M1/M2, Intel, phone: not available.

## Verification output

As journal 056.

# 054 — Light shafts and an ozone sky

**Plan:** plans/054-light-shafts-and-ozone-sky.md · **Session:** sky session (Claude, 2026-10-17) · **ADRs:** [0069](../decisions/0069-ozone-layer-in-the-atmosphere-model.md), [0070](../decisions/0070-light-shafts-from-baked-cloud-coverage.md) · **Research:** [three.md](../research/three.md) (plan 054)

**Status when written: criteria met; the aurora is not done (draft 061), ridge-cast shafts and a medium cloud-shadow map are draft 062.** Not measured on M1/M2, Intel or a phone-class GPU: none is available here.

## What was done

| Where | What |
|---|---|
| `atmosphere-model.ts`, `test/atmosphere-model.test.ts` | `OZONE` tent, `OZONE_ABSORPTION` (Hillaire's numbers), `OZONE_STRENGTH` 3.5, `ozoneDensity`, `Atmosphere.betaOzone`; `columnDensity`, `extinction`, `integratePath` carry a third depth; `mieRadiance`; 8 new tests |
| `sun-depth-table.ts`, `planet.ts`, `shaders/atmosphere.glsl.ts` | the table is RGBA half float (Rayleigh, Mie, ozone, unused); `uBetaO`; the march and `extinction` take a `vec3` of depths |
| `light-shaft.ts` (new), `test/light-shaft.test.ts` | weights, strength gate, the CPU twin of the shaft loss, `applyShaftLoss`, the cloud map addressing; 16 tests |
| `shaders/cloud-field.glsl.ts` (new), `shaders/planet.glsl.ts` | the cloud coverage field as shared GLSL (`cloudDensityQ`, `fbmF`) and its bake shader; `shaftLoss` and its application in the planet pass |
| `planet.ts`, `presets.ts` | the equirectangular R8 cloud map (`bakeCloudMap`, first frame and on a change of cover); `shaftSteps` 0 / 4 / 8 |
| `test/preset-switch.test.ts` | the first frame renders 6 faces plus the cloud map; the map is baked once (found by plan 052's run: the suite expected 6) |
| `docs/journal/assets/054-{before,after}-*.jpg` | sunset, twilight, two shaft scenes, terminator from orbit, noon pad; `054-after-shaftlow-half.jpg` |

## Method

Production builds of a clean copy of HEAD (`git archive`, the main tree held another session's work) with `NODE_ENV=development vite build` so `__orbital` exists: `base` (HEAD) and `after` (HEAD plus my renderer files), served by a small Bun static server on port 5222 (a POST route saves canvas JPEGs at quality 0.85), built-in browser pane, canvas forced to 1920 x 1080 at ratio 1, rAF stubbed, governor off, vessel of the VAB's two-stage example, scenes by synthetic snapshots (the live snapshot's vessel moved: straight up 3, 12 and 100 km; the hillside of journal 050 at 26.5 km east, 5.5 km north, ground 1 723 m, camera yaws 1.57 and 3.14). Frame time: thr = minimum of 12 windows of `benchmark(8)`, sync = minimum of 12 means of 8 `benchmark(1)`. Every number below is from a second page load of the build and preset (a new shader text compiles to a slower program on its first load in the hidden pane: the first runs of each build read 20 to 50 percent high). `shaft` = sun 24 degrees, camera toward it from 300 m; `shaftlow` = sun 12 degrees, same; both with the real 0.42 cumulus cover.

## Frame times (sync ms, base then this plan)

| Scene | `high` | `medium` |
|---|---|---|
| pad (`pad-morning`, real sun 30 degrees) | 13.64 to **14.18** | 10.79 to **11.16** |
| 3 km | 9.85 to **12.16** | 9.38 to **10.52** |
| 12 km | 7.04 to **8.52** | 7.27 to **7.51** |
| orbit, 100 km | 3.47 to **4.63** | 4.09 to **4.35** |
| hillside, view 1.57 | 12.08 to **14.27** | 11.41 to **12.26** |
| hillside, view 3.14 | 11.85 to **13.19** | 10.99 to **11.51** |
| `shaft` (facing the sun, worst case) | 8.96 to **11.40** | 8.50 to **9.75** |
| `shaftlow` | 9.24 to **13.06** | 8.70 to **10.23** |

Budgets: `high` 16.7 (worst 14.27), `medium` 13.3 (worst 12.26). Throughput (`thr`) differences on `high`: +0.5 at the pad, +1.75 at 3 km, +0.75 at 12 km, +0.1 at orbit, +1.7 and +0.8 on the hillside, +1.75 and +2.15 facing the sun. The sync column has about 1 ms of noise (orbit has no shaft work and reads +1.2 sync, +0.1 thr). The half-resolution rung on `medium` facing the sun: 9.75 to 4.94 ms sync, the shafts show at half resolution (`054-after-shaftlow-half.jpg`).

**How the technique was decided.** The first build evaluated the coverage noise (warp plus two octaves) at each of 10 samples: `high` sync 8.96 to 14.73 facing the sun (+5.8), 9.85 to 15.35 at 3 km (+5.5), hillside 12.08 to 16.02. A baked equirectangular coverage map read once per sample, 8 samples, cut that to +2.4, +2.3 and +3.9 sync (then the figures above on the final build). A screen-space radial blur was not built: the planet pass has no mask target and the half-resolution rung would need it twice (ADR 0070).

## Hitch

Journal 037's protocol (nine `setPreset` + first frame, a page whose precompile has finished), `base` then this plan, ms (call + first frame): base 2+50, 1+52, 2+48, 1+39, 2+32, 2+36, 1+29, 1+35, 2+30; this plan 3+43, 1+42, 1+57, 1+41, 1+30, 3+36, 1+29, 1+38, 2+36: the same 29 to 57 ms range, nothing near the 300 to 600 ms of a switch made before the precompile has finished. **The precompile of both builds finishes 84 s after the page loads** (measured with `precompile()`'s promise, 83.8 s this plan, 84.4 s base), so the protocol's 90 s is borderline: two earlier runs of this plan (and none of base) caught a first visit mid-compile (364 and 336 + 294 ms, 423 ms); a switch just before the precompile ends is as slow on the unchanged build. The first-frame cloud-map bake is one fullscreen pass of 0.5 Mpx (`preset-switch.test.ts` pins that no preset switch bakes it again).

## Look review against `visual-direction.md`

Ozone is the large change and it is right: with the sun at -1.5 degrees the sky away from the sun was olive green and a sickly gold at the horizon (`054-before-twilight.jpg`), now it is lavender blue overhead into an orange band at the horizon (`054-after-twilight.jpg`), the look of a real blue hour. At a 6 degree sunset (`054-*-sunset.jpg`) the pale cyan sky becomes a deeper violet-blue with a warm band at the sun; the noon pad (`054-*-pad.jpg`) is unchanged to the eye. From orbit at the terminator (`054-*-term.jpg`) the gold-and-teal limb becomes a violet band under a blue one and the lit ground reads lavender; it is stronger than the photographs I know of the real thing (the home body's ozone is scaled up 3.5 times, ADR 0069) and may want a smaller `OZONE_STRENGTH` after a person looks at it.

The shafts are honest but modest. With the home body's 0.42 cover (scattered cumulus, no banks) the beams are not many thin rays: they appear as a bright wedge beside a shadowed one around a low sun (`054-after-shaftlow.jpg`, `054-after-shaft.jpg`), shadowed haze beneath cloud masses and a darkening of the far hills under a cloud, and they are fainter at the sun's own glare than a photograph's. I raised the artistic gain to 1.5 (ADR 0070) and stopped there: 3 painted dark and blue wedges with saturated cyan at cloud edges. Still looks like a debug view, in order:

1. **Beams are soft and few.** A view ray toward the sun runs along the line of the cloud shadows, so the haze integral averages them; only a cloud directly in front of the sun gives contrast. A denser cloud deck would show more; the coverage field is fixed (0.42).
2. **Grain on the shadow edges.** Eight jittered samples leave a fine dither at shadow edges, visible at 100 % zoom on `high` and more on `medium` (4 samples); the bloom hides most of it.
3. **The far shadows have the cloud map's 3.7 km texel**, so shadow edges are soft and do not follow the cloud outline exactly (the macro shape, not the billows).
4. **Terrain casts no shafts.** The sun behind a massif gives glow, not beams (draft 062).
5. **The terminator is violet over the whole lit disc** at the site's sunrise; a person should judge whether to lower the ozone strength.

## What surprised me

- **Ozone changes the colour of everything with a slant path**, not only the twilight: the sun at the horizon loses 30 percent of its green and the orbit limb turns purple; the ADR 0037 haze tests passed untouched because they compare two atmospheres that both have ozone, so they are weak guards of ozone's own effect (the new tests compare with and without).
- **A clamp on the total in-scatter painted black wedges**: the cloud composite subtracts neighbouring snapshots (`S2 - S1`, `inscatter - S2`), and removing the shaft loss from each independently let the farther ones fall under the nearer ones; the fix (and `applyShaftLoss`) removes segment by segment. The black looked like NaN and was not.
- **Evaluating noise per sample is the wrong lookup**: a cloud field that costs 0.7 to 1.5 ms once per pixel costs 6 ms ten times; a baked map made it a texture fetch.
- Yaw and azimuth have opposite signs in the debug camera (yaw 0 looks at azimuth 90, a positive yaw turns toward smaller azimuths); I lost a few builds looking at the wrong side of the sky.
- The precompile takes 84 s in the hidden pane on an unchanged tree, so the preset-switch protocol's 90 s wait sits right on the edge.

## Not met / not done

- The aurora (optional item 3): draft 061.
- M1/M2, Intel, phone GPUs: not available. `medium`'s 4 steps and the 1024 x 512 map are measured on the M5 only.
- The governor in a live frame loop with the shafts: not run (the hidden pane's frame interval does not follow the GPU, journal 039).
- Roadmap page: no entry for 054 existed, nothing to remove.

## Verification output

```
bun test packages/renderer      395 pass, 1 fail   (the failure: stock part models triangle budget, `stock.wing` 12 triangles; plan 041's work in progress in mods/stock, not this plan)
bun run test                    1053 pass, 1 fail  (the same test)
apps/web vitest --run           615 pass, 5 fail   (design/editor/library format version 3 from plan 041's work; roadmap test: plan 052 is done and still listed, plan 052's roadmap entry)
bun run typecheck               all packages and svelte-check: 0 errors
bun run build                   done
bun run docs:check              OK (61 plans, 69 ADRs)
prettier --check                packages/renderer/src, test and the new docs: clean
```

The renderer tests for this plan: `atmosphere-model.test.ts` (8 new ozone tests), `sun-depth-table.test.ts` (1 new, 1 changed), `light-shaft.test.ts` (16), `preset-switch.test.ts` (1 changed, 1 new), `presets.test.ts` (`shaftSteps` ordered). Mutants: `applyShaftLoss` without the `maxShare` cap fails the "huge loss" test; dropping the green ozone term in `extinction` fails 2 ozone tests (dropping only the blue one is not caught, its absorption is 0.085e-6).

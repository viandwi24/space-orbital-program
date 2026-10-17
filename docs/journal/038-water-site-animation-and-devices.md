# 038 — Lakes, rivers, shore waves, a living launch site, a visible precompile

**Plan:** plans/038-water-site-animation-and-devices.md · **Session:** water session (Claude, 2026-10-17) · **ADRs:** [0072](../decisions/0072-lakes-in-the-height-function-flowing-rivers-and-shore-waves.md), [0073](../decisions/0073-launch-site-animation-from-the-snapshot.md), [0074](../decisions/0074-precompile-with-progress-and-a-loading-badge.md) · **Research:** [three.md](../research/three.md) (plan 038)

**Status when written: criteria met except what no hardware allows (devices, mobile: draft 066) and what is not cheap (analytic gradients, silhouette anti-aliasing: draft 068; floating: draft 067).** Not measured on M1/M2, Intel or a phone: none is available here, and nothing is claimed for them.

## What was done

| Where | What |
|---|---|
| `core/src/terrain.ts` (`LAKE_SHAPE`, `lakePotential`, `lakeGate`, `lakeLevel`, `lakeCap`, `lakeDepthAt`, `isLake`), `terrain.glsl.ts` | A lake is where `noise(wavelength 30 km) * siteGate` reaches 0.9; there the height is exactly 0; around it the relief is `min(relief, 0.9 (0.9 - level) / 7e-5)`, a cone that is 0.9-Lipschitz because the level's gradient is bounded (measured 5.55e-5 per m over 800 000 pairs, bound 7e-5). API 0.1.21. |
| `planet.glsl.ts` | Lakes as water (greener, calm, shallow, ragged shore inward only, sand strip), river flow (two-phase flow map along the level set, signed toward lower ground), shore waves (shoaling phase, breaker line, swash moving the waterline), all with the constants of the tested twins |
| `water-flow.ts`, `shore-wave.ts` | The maths: `flowPhases`, `flowVector`, `flowSample`; `surfPhase`, `crestSpacing`, `breakDistance` (H / (0.78 slope)), `swashOffset`, `surfFoam` |
| `site-animation.ts`, `site-steam.ts`, `site-meshes.ts`, `site-buildings.ts`, `site.ts` | Three swing arms as pivots (fold by the vessel's height above its resting height on the pad, slewed in wall time), steam (stateless puffs, 3 vents, camera-facing instanced quads), blinking beacons (two phases), lit window panes at night (panes split from the ribbons by a fixed hash, 55 percent) |
| `renderer.ts`, `precompile-progress.ts`, `apps/web` (`graphics-progress.ts`, `PrecompileBadge.svelte`, `flight-loop.ts`, the flight page) | `precompile(onProgress)` with a counter, the jobs ordered by what a quality change can reach, the vegetation warm-up in time slices; a badge under the toasts |

## Method

Production builds (`NODE_ENV=development vite build` so `__orbital` exists) of two clean trees in the scratchpad: `base` = `git archive` of HEAD 94b61f3 (before this plan), `after` = HEAD at the end plus my files; served by a small Bun static server on port 5226 (a POST route saves canvas JPEGs at 0.85), the built-in browser pane, canvas forced to 1920 x 1080 at ratio 1, rAF stubbed, governor off, vessel of the VAB's two-stage example, scenes by moving the live snapshot's vessel (`place(height, east m, north m)`, camera rig yaw, pitch, distance). Frame time as in journal 054: thr = minimum of 10 windows of `benchmark(8)`, sync = minimum of 10 means of 8 `benchmark(1)`; every number from the third or later load of its build in the pane (a new shader text compiles to a slower program on its first load in the hidden pane: the first `medium` run of the new build read 24.7 ms at the pad, 10.4 after a reload). New scenes: `lakeA` (1 500 m up, 12 km east of a 14 km lake at 80 000 east, -92 000 north of the pad, looking west), `shore` (60 m up at the coast 69 km west), `river` (40 m up beside a river, 68 km west).

Where the lakes are: the nearest on land is 101 km from the pad (the site gate opens from 30 to 80 km; a lake needs the level 0.9). 1.8 percent of the land is lake in 167 basins of 3 to 1 700 km2 (median 207 km2). A player sees them on the way up (the horizon from 8 km is 98 km) or from orbit, not from the pad. The relief around a lake is capped by the cone: on 31 percent of the land the cap is below the highest peak (3.7 km), so the tallest mountains are lowered there; on 3.6 percent it is below the hills (520 m); lakes are 1.8 percent. The scenic massif around the pad is untouched (the cap is above the highest ground within 30 km of the site: tested).

## Frame times (sync ms, base then this plan; thr in brackets as the difference)

| Scene | `high` | `medium` |
|---|---|---|
| pad | 14.06 to **15.57** (+0.58) | 11.05 to **11.68** (+0.50) |
| 3 km | 11.49 to **12.64** (+0.36) | 9.65 to **10.84** (+0.48) |
| 12 km | 7.70 to **8.61** (+0.19) | 6.84 to **7.80** (+0.26) |
| orbit | 3.51 to **5.32** (+0.14) | 3.36 to **4.03** (+0.06) |
| hillside, view 1.57 | 13.25 to **13.94** (+0.56) | 11.38 to **12.88** (+0.99) |
| hillside, view 3.14 | 12.17 to **12.66** (+0.45) | 10.64 to **11.24** (+0.52) |
| lake at 1.5 km (`lakeA`) | 12.26 to **13.56** (+0.64) | 10.56 to **12.11** (+0.92) |
| shore, 60 m | 12.76 to **14.05** (+0.50) | 11.07 to **11.76** (+0.60) |
| river, 40 m | 13.14 to **14.75** (+0.72) | 11.36 to **12.75** (+0.75) |

Budgets (ADR 0053): `high` 16.7 (worst 15.57), `medium` 13.3 (worst 12.88). The cost is the per-pixel lake level (one noise evaluation, a `dFdx` pair and an `acos`), the shore band and the river branch; the sync column carries about 1 ms of noise (orbit has none of this work and reads +1.8 sync, +0.14 thr). The half-resolution rung (`setPlanetScale(0.5)`, `high`) renders the lake, the shore and the river: 10.65, 10.13 and 11.54 ms sync (`038-after-lake-half-rung.jpg`).

## Motion (two frames 0.8 s and 1.8 s apart, mean absolute difference of RGB)

| | base | this plan |
|---|---|---|
| river pixels (blue-green in the lower 60 percent) / the rest | 0.60 / 0.77 | **13.29 / 1.86** (7.1 times) |
| foam pixels of the surf (white) / the sand | 0.81 / 0.26 | **2.96 / 0.02** |

## Precompile (hidden pane, M5)

`precompile()` start to resolution, protocol "boot, draw the first frames, then only poll": base 79.9 s and 83.9 s (the 84 s of journal 054 again), this plan 30.1, 13.3, 30.6, 30.4, 10.1 s (the range is the idle periods the page happens to get). With a page that renders and benchmarks while it waits, both finish at about 28 s. The shader programs themselves are ready 1.4 s after the first frame is drawn, 9.5 to 11 s after the page was asked to start (the first compile, of this preset's scene, dominates); the 70 s of difference was the vegetation of the other presets: `warmVegetation` took one step (0.3 ms) per idle period, and a hidden page's idle periods come every 2 s, 34 steps. Steps now run for 6 to 12 ms per idle period. Progress in the flight page's badge ("Compiling graphics programs", "Preparing terrain maps", "Preparing scenery", 0 to 99 percent, gone at 100; `038-precompile-badge.jpg`). The jobs are ordered this preset, the ones below it, the ones above (a quality change goes down), and the half-resolution target programs follow their preset.

First switch (journal 037 protocol, `setPreset` call + a synced frame, ms, page that has run 15 s): base low 6+45, medium 63+42, then 31 to 37; this plan low 4+50, medium 8+45, then 32 to 38. After the precompile has finished both read 28 to 40. One run on the first load of a rebuilt page read low 4+481 (a compile on first use, the hidden-pane artefact), and did not come back on three reloads.

## Look review against `visual-direction.md`

Files in `assets/` (JPG, 1920 x 1080 unless noted): `038-before-lake.jpg`, `038-after-lake.jpg`, `038-after-lake-near.jpg`, `038-after-lake-half-rung.jpg`, `038-before-river.jpg`, `038-after-river.jpg`, `038-before-shore-t0.jpg`, `038-before-shore-t1.jpg`, `038-after-shore-t0.jpg`, `038-after-shore-t1.jpg`, `038-before-liftoff.jpg`, `038-after-liftoff.jpg` (four vessel heights: the arms fold), `038-before-night.jpg`, `038-after-night.jpg`, `038-precompile-badge.jpg` (480 x 360).

- **Lakes**: a smooth shore with a wet strip, dark and calm water with no swell, a soft bank (the cone) that reads as a bank. They read as lakes from 1.5 km. At the shore a thin dark line of steep bank (0.9 slope, rock-coloured) is visible from a distance. A lake next to the sea (the nearest) meets the swell with a visible seam: the lake tint fades out where the sea's own depth begins.
- **River**: the ripples now move along the river and the brightness runs with them; the course is signed toward lower ground with a soft stall where it runs along a contour. Close to the ground (14 m) the river and the sea show the blocky normal that the base shows too (journal "found, not done").
- **Shore**: crests crowd toward the beach and run in, the white-water band is as wide as the model says (42 m for 1.1 m waves at 1:30) and the waterline moves by a few metres. The shoreline itself is still a stair of map texels (the biome map is 8-bit, pre-existing).
- **Site**: the arms fold in about 0.6 s as the vessel rises (they start at 5 cm and are folded at 1.2 m); steam from three vents is a soft wisp, small at 40 m; beacons and lit panes are visible at night, the lit panes read white rather than warm after the night exposure (emissive intensity 0.9).

## What surprised me

- **A lake in a hilly world needs the relief to move away, not only the water to appear.** 98 percent of the land has relief, so a lake in the shader alone would have had hills standing in it: the first attempt, carving the biome map's elevation, gave coast cliffs (slope 2.06 against the bound 1) because the carve changed the elevation in a texel or two while the coast margin of `terrainHeight` needs 6 km at 4.5 km of relief. A cap that is `slope * (to - level) / gradientBound` is Lipschitz by construction, and the minimum with the old height keeps the bound; the price is a wide reach (the tallest peaks are lowered on 31 percent of the land) because the gradient bound is the worst case.
- **The relief gate and the lake gate must not share a narrow ramp.** The first gate used the map elevation (coast margin, highlands) and multiplied the potential by it: the gate's own gradient was four times the noise's. Only the site gate (a smooth 50 km ramp) is left.
- **The "84 s precompile" was not the shader compiler.** The programs are ready ten seconds after the first frame; the rest was 34 idle callbacks of 2 s.
- **The distance to the coast is not a distance.** `sdCoast` carries the fractal displacement of the coast and changes by 3 to 5 m per metre; surf bands in it were blotches until it was divided by its own screen-space gradient.
- **The harness**: a WebGL canvas is cleared between tasks, so a sheet that `drawImage`s after an `await` gets a flat colour; draw in the same task as the last render.

## Found, not done

- Close to the ground (under 20 m) the sea, the rivers and the shore show a blocky normal and a stair-step coastline; both are in the base build (`038-before-shore*.jpg`, `b-shoreC`), from the 8-bit biome map and the ripple noise at centimetre footprints.
- Over flat coastal land at a low sun the ground shows long terraces (visible in the base at 58 km west): not from this plan.
- The terrain's own slope exceeds the stated bound of 1 at rare points (1.4 at three of 160 000 pairs near lakes, where the cap did not bind): `terrain.test.ts` samples too few points to see it. The cap itself is tested to 0.9.
- The planet pass's far lakes are skipped beyond a footprint of 2.5 km (they vanish from orbit).
- `RENDERER_VERSION` was not touched.

## Not met / not done

- M1/M2, Intel, phones, `selectPreset`, mobile: no hardware (draft 066). Nothing is claimed.
- Floating and sinking (draft 067), analytic noise derivatives and silhouette anti-aliasing (draft 068).
- The roadmap page lists the follow-up drafts instead of 038.

## Verification output

```
bun test packages/renderer      522 pass, 0 fail
bun run test                    1206 pass, 1 fail   (mods/stock boot test: plan 040's unfinished `stock.engine-cluster`, not this plan; core 177 pass)
apps/web vitest --run           654 pass
bun run typecheck               all packages and svelte-check: 0 errors
bun run build                   done
bun run docs:check              OK (66 plans, 75 ADRs)
prettier --check                my files clean
```

Tests of this plan: `core/test/lakes.test.ts` (7), `renderer/test/water-flow.test.ts` (6), `shore-wave.test.ts` (6), `site-animation.test.ts` (8), `precompile-progress.test.ts` (3), `apps/web/src/lib/graphics-progress.test.ts` (3). Mutants: lakes without the cap fail 3 tests, a cone slope of 1.6 fails the cone test, a flow offset of 0.4 fails the weights test.

# 418 — Smooth and stable: what allocates, what stalls, what the pad costs

**Plan:** [plans/418-smooth-and-stable.md](../plans/418-smooth-and-stable.md) · **Session:** Worker C, 2026-11-08 · **ADR:** [0375](../decisions/0375-keep-three-raw-webgpu-for-hot-passes.md) · **Machine:** the owner's M5 MacBook Pro, headed Chromium, 1512 x 945 at a device pixel ratio of 2, WebGPU, shared with two other workers (load average 2.4 to 4.4: **not** the 3 or less the freeze needs, so the budgets are not frozen)

## Step 1: the state of each suspect of `refs/graphics-v2/06`

Written into the suspect table at the end of 06 ("Suspect table, updated"). In short: 1 (warming), 3 (TAAU state), 4 (pacing above 144 Hz), 5 (governor steps), 6 (autosave) and 9 (rocks) were fixed by plan 408. 2 (major GC) was only reduced by 409 and is the main thing this plan changed. 7 (terrain patch rebake) was open and is amortised here; 8 (cloud map) is gentler since 408 and is one bake every 8 s.

## What the tools found

- **`perf:gate --soak`** (new). About 3 minutes a scene at the pad, in orbit, on an ascent and at the Space Center. The page samples the frame intervals and the heap every 100 ms; Chrome's trace (`devtools.timeline`, `toplevel`) gives each garbage collection (heap before and after) and every main-thread task over 8 ms with the function that filled it. Reported per scene: heap floor growth, allocation rate (MB/s, from the collections), major and minor GCs, long frames a minute, main-thread tasks over 8 ms a minute. Budgets live in the `soak` block of `apps/web/perf-budgets.json`; the comparison is `soakFailures` in `src/lib/perf/gate.ts` with unit tests. The smoke run showed the trace gives the GC events and the ascent scene works.
- **`scripts/profile-alloc.ts`** (new): V8's sampling heap profiler (collected objects included) by scene, to rank who allocates. **`scripts/profile-cpu.ts`** (new): V8's CPU sampler by scene. Both need a build with names: `ORBITAL_PROFILE=1 bun run build`.
- **The main thread is not what lags on the M5.** CPU profile, pad and orbit at High, 20 s each: the main thread is 80 to 82 % idle (about 180 ms of every second busy at 60 to 120 fps, that is 1.5 to 2.3 ms a frame), and `renderer.debug.benchmark` with the whole launch site off changes the CPU frame by -0.06 ms. So the pad's 16 ms at High is on the GPU; the stutter the owner feels is memory (below) and GPU load.
- **Low and Medium already hold 120 Hz at the pad on the M5.** Interleaved in one page, 3 rounds of 10 s: Low 8.33 ms mean at the pad and in orbit; Medium as shipped 8.33 and 8.33. High is 16.4 ms at the pad (orbit 8.33): the 120 target at the pad fails at High only.

## Allocation audit (step 3)

Ranked by the sampling profiler at the pad (25 s, High, 1643 MB sampled), then again after each fix. What it found and what was done:

| Where | What it allocated | Fix |
|---|---|---|
| `debug/frame-histogram.ts` | `slice` of two arrays of a two-minute window (14 000 frames at 120 Hz) on every frame: 261 MB in 25 s, the largest single item | a head index, compacted when half is dead |
| `navball-math.ts`, `hud/navball-draw.ts` | about a thousand objects a frame: four per point of every graticule curve, a `BallPoint` per point, a tuple per drawn point (visibleRuns, elevationCircle, meridian, groundRegion: about 330 MB in 30 s in orbit) | curves built into one scratch list (`fillElevationCircle`, `fillMeridian`, `setHorizonDirection`), stroked as they are projected (`strokeVisible`, tested equal to `visibleRuns` for 75 orientations), plain loops for the ground |
| `webgpu-compat.ts` `hideUnported` | an array and two filters for every object of the scene, and an iterator per node, every frame | the common mesh (one node material) only walks on, by index |
| `environment.ts` | `sunTransmittance`, `skyAmbient`, `horizonColour` integrated the atmosphere with tuples every frame (a fifth of the Space Center's garbage) | `SkyLightCache`: reused while the sun moves under 0.01 degrees and the camera under 0.5 m; worked out every frame under warp or in a climb as before |
| `site-meshes.ts` `thinTufts`, `site-lod.ts` | in orbit and any view outside the site's detail range: a `Vector3` and a re-sort of 30 000 instances with a `subarray` view per instance, every frame of a fast camera | out of range, only the visibility flags are set; the copy is a plain loop; one scratch vector |
| `hud-model.ts` `vesselThrottle` | `describeModule` (a zod parse) for every module of every part on every HUD update | a module that is no engine is described once per part definition |

Not done (each one is a few per cent of the rate now): three.js internals (cache keys, render lists, pass descriptors: `getDynamicCacheKey`, `customCacheKey`, `_update`, `painterSortStable`), the snapshot structured clone in `worker.onmessage` (about 28 MB in 30 s), `silhouetteProfile` (plasma), `moonHeight`, and the atmosphere in the planet pass.

## Soak numbers (the allocation rate, before and after)

Headed, WebGPU, governor off, the trace on (which costs some frame time: read the rows against each other, not against the plain runs). The base build is main plus the soak tool; the new build adds the fixes above and the terrain-patch slicing. One interleaved round each (base, then new), 180 s a scene, load 3.5 to 4.4.

| Preset | Scene | Build | mean ms | long frames/min | alloc MB/s | major GCs | minor GCs | tasks over 8 ms/min | heap floor growth MB |
|---|---|---|---|---|---|---|---|---|---|
| High | pad | base | 16.93 | 2112 | 97.3 | 63 | 748 | 1.0 | -1.2 |
| High | pad | **new** | 16.39 | 2026 | **62.1** | **44** | 565 | 1.0 | -0.8 |
| High | orbit | base | 8.33 | 0 | 84.9 | 30 | 552 | 0.7 | 3.4 |
| High | orbit | **new** | 8.33 | 0 | **68.1** | 29 | 568 | 0.0 | -1.0 |
| Low | pad | base | 8.33 | 0 | 126.7 | 43 | 845 | 1.0 | -0.5 |
| Low | pad | **new** | 8.33 | 0 | **62.2** | **28** | 579 | 0.3 | -0.8 |
| Low | orbit | base | 8.33 | 0.3 | 114.3 | 25 | 706 | 1.3 | -0.4 |
| Low | orbit | **new** | 8.33 | 0 | **60.8** | **18** | 521 | 0.3 | -0.6 |

The same cells over 40 s, two rounds each (High): pad 79.8 and 80.3 against 61.4 and 59.0 MB/s; orbit 73.7 and 72.6 against 55.4 and 56.4; Space Center 50.6 and 51.1 against 37.5 and 37.6. Low allocated more than High in the base build because it draws at 120 Hz at the pad where High draws at 60: the garbage is per frame.

Reading:

- The allocation rate fell by 20 to 51 % (Low: about half). Major GCs fell by a third at the pad on both presets and by a quarter at Low in orbit.
- **The heap floor is flat** (within 3.5 MB over 3 minutes in every scene: no leak).
- **No long frame comes from background work.** Over 3 minutes at Low the pad has no long frame and orbit one of 17 ms (base only). The trace's tasks over 8 ms are 0 to 1 a minute: the page's own frame function (`Zt` in the flight page's chunk) and, once, a major GC. No warming round, rebake, autosave (one fell inside every 180 s run) or rock rebuild was over 8 ms.
- **The rate is still about 60 MB/s**, three times the placeholder budget of 20: the budgets in `perf-budgets.json` are targets and the soak fails against them today. They are not frozen (load over 3 in every run); the next plan to lower the allocations (three's internals, the snapshot clone) should bring them down first, then freeze.

## Background stalls (step 4)

- **Warming, autosave, cloud rebake, rock rebuilds:** confirmed by the trace above (no task over 8 ms in pad, orbit, Space Center, ascent; 40 s and 180 s runs). The cloud map is still one full-sphere bake every 8 s; if a trace ever shows it over 8 ms, slice it by strips.
- **Terrain patch rebake (fixed):** the cube bake and the two patch bakes could land in one frame (up to 8 ms on the M5 at High, journal 068). `patchBakesThisFrame` runs one of the three a frame in play, and all of them on a load or resize. Unit-tested. Not seen in a trace (the ascent was not soaked for 3 minutes); the claim is the by-construction one.
- **TAAU rung change (fixed):** three's TAAU node reads the scene pass's target size in a hook that runs before the pass resizes its target (`PassNode.updateBefore` calls `setSize` after it), so on the frame of a rung, preset or canvas change the jitter and the mesh terrain's distance image used last frame's size. `taauInputSize` gives the size the pass is about to have (drawing buffer times the scale, floored, as `PassNode.setSize`); the renderer passes it to both. Unit-tested; the one-frame artefact itself is not visible in a trace and was not captured.

## The pad's launch site (step 5)

- **The unexplained 3.5 ms is on the GPU, not the CPU.** CPU: main thread 80 % idle; with the site off the CPU frame changes by -0.06 ms; with any one of vegetation, structures, floods, people, steam, rocks, trees, tufts, bushes off, by -0.1 to +0.3 ms.
- **GPU (interleaved, 3 rounds, High, the pad, the machine at load about 4):** whole site off 17.5 to 13.5 ms (-4.0). All eight switchable parts off together: 17.5 to 17.0 (-0.5). So about 3.5 ms is in objects under `launch-site` that no look switch reaches. The site holds 166 meshes, 103 visible, 401 000 triangles visible (177 800 of them one instanced tuft set, the rest LOD sets of trees, bushes and rocks, six skinned crew of about 6 000, the bundle's 15 000, the list buildings). `scripts/inspect-site.ts` prints them.
- **Bisect by hiding** (`scripts/bisect-site.ts`, High, the pad, interleaved, headed, load 3 to 4; absolute numbers drift 1 to 2 ms between runs, the differences held in every run):

| What is hidden | Mean frame interval |
|---|---|
| nothing | 17.3 to 18.3 ms |
| the whole site root | 13.5 ms (-4.0) |
| every one of the 149 children of `launch-site` | 14.2 ms (-3.2) |
| every material (`material.visible = false`), all eight look switches, shadow casters off, or the static bundle, each alone | -0.1 to -0.5 ms, no single material over 0.3 |
| child [0] `site-buildings` alone | 14.7 ms (-2.7 to -3.0) |
| `site-buildings` child [0] `site-building-list` alone | 15.6 ms (-2.65), the list is the only child that draws |
| the list's 8 children: the first four / the last four | 15.65 / 18.00 |
| the list's children 0..1 / 2..3, then 0..0 / 1..1 | 15.17 / 17.49, then 17.75 / 15.46: **one merged mesh, list child [1]** |

- **Explained (second pass, owner-approved).** The mesh is the list's `painted` mesh (4 864 triangles, 250 x 41 x 240 m, `weatherMaterial` with `amount` 0.8 and no rust). `scripts/bisect-site.ts` with `MODE=flags` (High, the pad, interleaved, headed, 3 rounds of 6 s, load 3.1 to 3.5) took the mesh apart; mean frame interval, ms:

| State of list mesh [1] | Mean (run 2 / run 3) | Meaning |
|---|---|---|
| unchanged | 18.70 / 18.25 | |
| `castShadow` off | 18.82 / 18.13 | the shadow pass is not the cost (0 to 0.1) |
| `receiveShadow` off | 18.55 / 17.90 | shadow lookups 0.15 to 0.35 |
| hidden | 16.61 / 15.53 | the whole mesh is 2.1 to 2.7 |
| a plain `MeshStandardMaterial` (all scene lights, no weather) | 18.22 / 17.12 | |
| plain standard material with the same `lightsNode` (sun and sky only) | n/a / 16.47 | weather twin = 18.25 - 16.47 = **1.8 ms** |
| `MeshBasicMaterial` (no lighting) | 16.55 / 15.52 | sun, sky and IBL lighting of it = 0.95 ms |

So the mesh's cost is fragment cost, not geometry or shadow casting: its weather patch (`tsl/twins.ts`, `weather`) is 1.8 ms, lighting about 1 ms, shadow lookups 0.2 to 0.3; the vertex and raster side is nil (basic material equals hidden). The `painted` mesh covers a large part of the screen at the pad, and the weather patch evaluates seven 3-D value noises (8 hashes each) per pixel. Material-level hiding hid every material at once, which is why that bisect showed no single material.
- **Fix made (exact, no look change):** the streak mask noise is only evaluated where the streak is above 0.58, and the ground-grime noise only below 3.5 m; both masks are exactly zero elsewhere (`smoothstep` edges), so the image is the same. Interleaved on the pad at High (3 rounds, load 2.3 to 2.9, base build then new build): base 18.43, 18.25, 18.03 = 18.24 ms; new 18.27, 17.90, 17.81 = 17.99 ms: **-0.25 ms**. Screenshot check (`scripts/shot-pad.ts`, the pad at High, two base shots and one new): mean absolute difference 0.91 (base vs base, the world moves), 0.76 and 0.69 (base vs new): the new build is inside the base's own run-to-run difference. Branching gains less than the saved noise count suggests (GPU lanes diverge), so this is a small win.
- **The rest is a look decision, not a defect:** the weather patch is 1.8 ms on the one mesh (the other weathered meshes were not measured). Cutting it further changes the look (drop the grain and the 0.9 m mottle octaves beyond a distance, evaluate the patch per vertex, or bake it into the vertex colours at build time), which this plan's rule ("fix only stutter and cost, do not change looks") does not allow. It is written as the owner's call: the upper bound is 1.8 ms of the pad's 16.4 to 18 ms at High. A z-prepass would remove overdraw of the expensive pixels, but the depth equality between the two shaders is not guaranteed and a mismatch shows as z-fighting, so it was not tried.
- **Plan 414's target is not met:** the pad at High is about 16.4 to 18 ms mean (GPU-bound; the main thread is idle), against 8.3. The site's remaining cost is spread (the whole site off is -4.0 ms; the building list was 2.7 of it, now about 2.45). Low and Medium hold 8.33 ms at the pad. A raw WebGPU rewrite is not indicated by any trace here, so no such plan is written.


## Low on a Retina display (step 6)

Low draws straight into the canvas (`post: false`), so TAAU at Low means adding the whole post chain. `scripts/eval-low-taau.ts` measured the nearest thing on one page, interleaved, 3 rounds of 10 s, headed:

| View | Low today (ratio 1, no TAAU) | Medium forced to ratio 2, TAAU 0.5 (Low's scene pixels, the post chain) | Medium as shipped (ratio 1.5, TAAU 0.5) |
|---|---|---|---|
| pad | 8.33 ms, 33.8 % over 8.4 | **10.34 ms**, 41.4 % over 8.4, 7.1 % over 16.7 | 8.33 ms, 34.1 % |
| orbit | 8.33 ms | 8.33 ms | 8.34 ms |

The variant is Medium's other settings too (shadow map, octaves), so it is an upper bound on the post chain, but at the pad it costs 2 ms over Low and the rule was "only if the cost at the pad and in orbit is at most the current Low". **Not turned on.** Medium as shipped holds 120 at the pad on the M5 with a sharper image than Low (ratio 1.5, TAAU): for a Retina display the answer is Medium, which the device-tier default can pick. Low with TAAU stays a candidate for a plan that builds the chain without Medium's other costs.

## Budgets

Second pass: a freeze was attempted once the 1-minute load fell to 2.97, and stopped by me when it rose to 5.1 during the orbit scene (pad: 20.35 ms mean, 51.9 MB/s, 35 major GCs, load 3.5): noisy numbers are not frozen, and the file was left as it was. First pass: not frozen: the load average was 2.4 to 4.4 in every run (two other workers measuring and building), above the 3 the rule allows, and the soak does not meet the placeholder budgets yet (62 MB/s against 20). `bun run perf:gate --soak --freeze` writes the soak budgets (and `--freeze` alone the frame budgets) when the machine is quiet.

## Checks

- `bun test` in `packages/renderer`: 1097 pass, 0 fail. `bunx vitest run src/lib` in `apps/web`: 2025 pass, 2 fail, both in `sim-host-script-worker.test.ts`, which fails the same 2 of 5 on a clean main (the coordinator's note).
- `bun run typecheck`: all packages and `svelte-check` 0 errors.
- `probe-dusk`: "pipelines before dusk 92, after 92: 0 built". `probe-textures --gate`: "gate ok: no pipeline over 15 sampled textures, none failed". Not run: Playwright e2e (paused by the owner); the M2 and Windows `[manual]` lines.

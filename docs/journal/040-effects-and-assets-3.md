# 040 — Effects and assets 3: wreckage, plasma shape, blackout, trails, multi-nozzle engines

**Plan:** plans/040-effects-and-assets-3.md · **Session:** effects-3 session (Claude, 2026-10-17) · **ADRs:** [0077](../decisions/0077-wreckage-and-stages-are-kept-by-the-renderer.md), [0078](../decisions/0078-plasma-shell-from-the-vessel-silhouette.md), [0079](../decisions/0079-plasma-blackout-is-a-display-of-the-heating-flux.md), [0080](../decisions/0080-exhaust-trail-as-a-ribbon.md), [0081](../decisions/0081-multi-nozzle-engines-in-the-part-descriptor.md) · **Research:** [effects-3.md](../research/effects-3.md), [three.md](../research/three.md) (plan 040)

**Status when written: every criterion met in its relative form; one absolute figure is not (the burning pad is over the 16.7 / 13.3 ms budget on HEAD too, see "Frame times").** KTX2 is draft 065 (with the numbers), M1/M2/Intel/phone timings stay draft 066 (no hardware), a communications system is the new draft 070. Not measured on any GPU but the Apple M5.

## What was done

| Where | What |
|---|---|
| `effects/wreckage.ts`, `wreck-field.ts`, `system.ts` | an impact near the ground plans where each thrown piece lands (landing time solves `y(t) = floor`, rest point on the terrain under it, lying flat), the flight settles into that pose, then one static mesh per wreck takes over for 900 s of sim time (8 at most, none on `low`); a smoulder of dark puffs for 45 s; the explosion's tangent frame is fixed to the body |
| `remnants.ts`, `scene.ts` | a vessel that lay still on the ground for 9 s and then vanished (the sim's rest rule, ADR 0021) stays as it lies: its models frozen to the ground, at most 3, 24 parts each; a time jump backwards clears wrecks and remnants |
| `effects/plasma-shape.ts`, `plasma-mesh.ts`, `shaders.ts` | the shell is a lathe of the stack's silhouette profile (10 slices) pushed out by Billig's stand-off, with a cap and a tail that fades; CPU only (9 microseconds for 40 parts); the wake starts inside the stack |
| `effects/reentry.ts` | **`PLASMA_FLUX_START/FULL` lowered from 1e5 / 2e6 to 5e4 / 6e5** (the old numbers made the glow invisible in every return at 2.4 km/s), `blackoutLevel` (1.5e5 to 4e5) |
| `apps/web` | `blackout.ts`, `BlackoutBadge.svelte`, `HudModel.blackout`, one line in the flight page |
| `effects/trail.ts`, `trail-ribbon.ts`, `shaders.ts` | the ribbon: one trail per vessel from the merged flames, 30 m / 0.5 s sampling, 256 points, 45 s, wind drift, widening and thinning, one draw call |
| `core`, `mods/stock`, `parts/cluster.ts`, `generators/engine-cluster.ts`, `plume-mesh.ts` | `plume.nozzles` (API 0.1.23), `clusterLayout`, the `engine-cluster` generator, `stock.engine-cluster` (KR-4, four bells, gimballed), a plume holder per bell, diamond period from the exit diameter |
| tests | `wreckage` 15, `plasma-shape` 17, `blackout` (renderer 9, web 5), `trail` 18, `trail-scene` 5, `wreck-scene` 13, `cluster` 10 |

## Verification

| Check | Result |
|---|---|
| `bun test packages/renderer` | 530 pass, 0 fail (55 files) |
| `bun run test` | 1 232 pass, 0 fail (138 files) |
| `apps/web` vitest | 725 pass (83 files) |
| `bun run typecheck` | 0 errors in every package, svelte-check 1 522 files 0 errors |
| `bun run build` | ok |
| `bun run docs:check` | ok |
| prettier | clean on every file of this plan |
| not run | the Playwright suite (no Playwright on this machine's budget, plan constraints) |

Criteria with their evidence:

- **Wreckage**: `wreckage.test.ts` (landing time solves `y(t) = floor` to 1e-9 for 144 shards at three floors, rest on the floor, normal vertical to 1e-6 for 40 normals and yaws, same seed same wreck, presence 1 until 870 s, 0 at 900, ninth evicts the first); `wreck-scene.test.ts` (an impact, then 6 s: the explosion is gone and one wreck mesh with the plan's pieces; 120 s later the wreck is still there; paused time does not age it; 900 s later it is gone; the ninth takes the first's place; `low` keeps none; a burn keeps none; a time jump clears; a loss at 5 km keeps none). `[manual]` `assets/040-wreckage.jpg`: the pieces of the 23-part rocket 60 s after the crash, lying flat on the plain.
- **Remnants**: `wreck-scene.test.ts` (11 s at rest then gone: kept and visible; after 4 s, hot, moving, high up, or the active vessel: not kept; the fourth evicts the first; lifetime; time jump). `[manual]` `assets/040-remnant.jpg`: the whole stage lies on the ground beside the wreckage.
- **Plasma shape**: `plasma-shape.test.ts` (nose-first and tail-first profiles of a stack with a wide base, the stand-off equals Billig to 1e-12 and falls with Mach, the shell is the profile plus the stand-off, rings never turn back, normals unit length, the geometry attribute holds the rings after an update, 9 us for 40 parts). `[manual]` `assets/040-plasma-shape.jpg` (side) and `040-plasma-front.jpg` (from the front).
- **Blackout**: `blackout.test.ts` (renderer: thresholds, no blackout in vacuum or when slow, monotone in speed, a window in altitude, equals the heating flux; web: orbit, pad and slow climb none, an orbital return in the thick of it shows the badge, no atmosphere none, air speed not ground speed). `[manual]` `assets/040-blackout.jpg`: the real HUD of a vessel loaded into a return state (24 km, 2.4 km/s, engines first) with "SIGNAL LOST plasma blackout" under the situation bar.
- **Trail**: `trail.test.ts`, `trail-scene.test.ts`. `[manual]` `assets/040-trail.jpg` (near) and `040-trail-far.jpg` (from the side at 700 m).
- **Multi-nozzle**: `cluster.test.ts` (layout, stock descriptor equals the generator within 1e-6, the bells fit and do not touch, a plume holder per bell on the gimbal pivot, the retracted model fits the shape, the schema takes 2 to 9 and rejects 1, 10 and non-triples, the diamond period). `[manual]` `assets/040-cluster.jpg` (the burning cluster of the lower stage from a little below, the upper cluster unlit above it).
- **Preset-switch hitch**: below.

## Frame times

Built-in browser pane (hidden), Apple M5, canvas forced to 1920 x 1080 at ratio 1, governor off, production builds of clean copies (`git archive HEAD`, and HEAD plus this plan's files), dev hooks on. Scenes by synthetic snapshots from the 23-part booster rocket of plan 026: `pad` = engines burning at 14 m (smoke and dust), `crash` = a wreck and a remnant 60 s old, `plasma` = 2.35 km/s at 22 km engines first, `ascent` = climbing from 300 to 2 400 m with a trail. `sync` = minimum of means of 8 single frames. **The machine was noisy** (the same scene read 14 to 26 ms minutes apart; the canvas also falls back to 1 x 1 when the pane resizes, which made the first runs read 0.5 ms; every number below re-asserts the size before each window).

GPU cost of this plan's own draws, A/B inside one page load (`material.visible` of the trail ribbon, the wreck meshes and the plasma shell off or on, interleaved, minimum of 6 to 12 windows per variant), sync ms, on then off:

| Scene | `high` | `medium` |
|---|---|---|
| crash (wreck, remnant) | 14.38 / 14.41 | 12.10 / 11.80 |
| plasma (shell, wake) | 8.24 / 8.06 | 7.39 / 7.60 |
| ascent (trail) | 13.73 / 13.67 | 11.39 / 11.38 |

Largest difference +0.3 ms (`medium` crash), the others within +-0.2: noise. All six are under the 16.7 / 13.3 ms budgets.

The burning pad (the worst effects scene), `base` (HEAD) against this plan, min over 3 runs of 20 windows, thr / sync ms:

| Preset | base | this plan |
|---|---|---|
| `high` | 17.13 / 23.45 | 14.55 / 24.00 |
| `medium` | 11.34 / 16.85 | 11.40 / 17.27 |

The sync figure differs by +0.55 (`high`) and +0.42 ms (`medium`), the throughput by -2.6 and +0.06: within the 1.0 ms of the criterion. **The absolute budget is not met by this scene on either build**: 23.5 to 24 ms (`high`) and 16.9 to 17.3 ms (`medium`) against 16.7 and 13.3. This is HEAD's cost, not this plan's: the scene fills the screen with the smoke of the rocket's engines and a 23-part rocket on `high`; the quality governor (ADR 0053) is what keeps it playable. The idle-pad scenes of journal 054 were not re-run (this plan changes nothing in the planet pass).

CPU (one `prepareFrame` with the effects update, ms, base then this plan): pad 0.098 / 0.127, crash 0.075 / 0.072, plasma 0.077 / 0.080, ascent 0.097 / 0.098.

Hitch (journal 048's protocol: nine `setPreset` plus first frame on a page whose precompile reports finished, ms): this plan 1 092 (first visit to `low`), 107 (first `medium`), 36, 35, 22, 38, 21, 25, 36; base 979, 754, 37, 50, 29, 30, 29, 53, 33. After the two first visits every switch is 21 to 38 ms (bounds 25.6 `low`, 38.8 `medium`, 50 `high`) in this plan and 29 to 53 ms on base: the first visits are slow on both builds (the pane's first compile of a preset's programs, not this plan's), and nothing is worse than base.

## Self-review against `product/visual-direction.md`

| Aspect | Verdict |
|---|---|
| Wreckage | Better, not release quality. Pieces are real triangles of the destroyed parts in their paint, charred, lying flat on the terrain for 15 minutes, with a smoulder at first. They are thin slabs: no thickness variation, no scorch mark on the ground, nothing standing up, no fire. A person would read it as "debris", not as "a wrecked rocket". |
| Stages that stay | Met for the case it covers (a stage that came to rest and was removed by the sim's rule). The preset switch drops remnants, and a stage destroyed by impact is wreckage, not a stage. |
| Plasma shape | Met: the shell hugs boosters and nose, and wraps the front view. The colour is flat (a tinted additive layer), the wake is a soft white-pink cone, and there is no Mach cone, no separate bow shock at the nose cap. The shell's tail fade is a look constant. |
| Plasma thresholds | Fixed a bug of plan 033/020: the glow was invisible in an ordinary return. The colour by speed is still Earth-scaled (deep orange at 2.4 km/s). |
| Blackout | A badge and scan lines; nothing is lost (draft 070). |
| Trail | Present and sheared by the wind, one draw call. It is a flat tan-white band from far away and thin from near; it has no puffs or lumps of its own beyond a noise edge, and a camera looking down the trail sees it end-on. A ribbon is as good as it gets without a volume. |
| Cluster engine | Four bells on a ring, four plumes, gimballed. The bloom of the plumes at the exit hides the bell lips in daylight; the placement and layout are right. No art beyond the procedural bells. |
| Performance | No measurable change (above); the pad scene is over budget on HEAD too. |

## Surprises

- **`Float32BufferAttribute` and `Uint16BufferAttribute` copy their array.** The plasma shell drew nothing and the ribbon had degenerate indices because the code wrote into the original array after constructing the attribute. Both are pinned by tests that read the attribute's array after an update. Recorded in `research/three.md`.
- **A custom shader reading `position` from an interleaved attribute drew nothing**; the same bytes under another name (`aCentre`) draw. Found by replacing the shader with a flat red one and bisecting the vertex shader over four builds. Reason not found.
- **A camera-facing strip culls itself** unless `side: DoubleSide`.
- **Five engines overran `MAX_TRAILS` 4**: each new offer evicted a trail that had just been fed, so no trail ever had two points. The headless test with one engine passed. Fixed by one trail per vessel from the merged flames; a test with two engines pins it.
- **The glow thresholds were for Earth.** The first plasma screenshot showed a cylinder where the shell should be: it was the wake. The shell itself was invisible and so, at 2.4 km/s, was the whole effect (ADR 0078).
- **The pane's canvas falls back to 1 x 1** when its container resizes while hidden; every timing run must re-assert the size.
- **`ps` shows nothing of the system in this sandbox**, so the other session's load on the GPU could not be seen; the A/B in one page was the way round it.

## Not done / found, not done

- KTX2: draft 065 has the numbers (515 kB wasm, 245 kB gzipped). M1/M2/Intel/phone frame times: draft 066.
- A communications system: draft 070. The blackout has no effect on controls or scripts.
- Mach-diamond art beyond the period change (real models are needed to judge it; the asset path of plan 051 can carry its own `nozzles`).
- A scorch mark and standing pieces for wreckage; remnants surviving a preset switch (their models belong to the factory that is replaced).
- The player cannot hit a wreck or a remnant (they are pictures, ADR 0077).
- The e2e suite was not run.

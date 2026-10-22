# Frame budget and efficiency: what a frame costs, and the techniques that fit three r186

**Checked:** 2026-10-22 (plans 362 and 363). **Machine:** MacBook Pro M2 13" (60 Hz, 2560 × 1600), AC power, Chromium 1248 from Playwright on Metal, WebGPU. The owner's M5 numbers are in `refs/graphics-performance/07-m5-baseline.md`; the M5 itself was not available for this pass.

**Scene:** Kronos V + Selene (30 parts, 10 stages) in a 100 km circular orbit over Home, viewport 1512 × 945 CSS at scale 2 (the 14" MacBook Pro), unless a row says otherwise.

**Tools:**
- `apps/web/scripts/measure-auto-quality.ts`: frame intervals, the governor's levels and changes, GPU ms, switch stalls (`STEPS=1`), load time.
- `apps/web/scripts/profile-frame.ts`: a CPU profile and a sampled allocation profile (garbage included) over the same seconds, per drawn frame, against an unminified build (`ORBITAL_PROFILE=1`).

**Caveat:** this machine is shared with other agent sessions. Heavy jobs ran one at a time under `/tmp/orbital-heavy.lock`, but other processes (the desktop app's renderer at up to 150 % CPU, a node job at 100 %) ran outside it. Repeat runs of the same configuration varied by up to 10 fps; the tables give each run, not a best of.

## 1. The frame on the GPU

What the timestamps say against what the player gets (WebGPU, governor off):

| Preset | canvas | GPU ms (timestamps) | frame interval p50 | fps |
|---|---|---|---|---|
| medium | 2268 × 1417 | 6.1 | 16.7 | 60 (47 in one disturbed run) |
| high | 3024 × 1890 | 6.2 – 8.9 | 32.4 | 39 – 55 |
| low | 1512 × 945 | 0.7 – 1.7 | 16.7 | 60 |

- In orbit the march is cheap (no terrain under the camera at 100 km, no vegetation: `SITE_DETAIL_RANGE` hides it). `high` still misses 60 where its timestamps say 6–9 ms: the frame's end at 5.7 Mpx (resolve, present, the canvas copy) is what the timestamps do not see on Apple GPUs (ADR 0248). Here it costs `high` 15–25 ms that no feature switch reaches.
- **What it means:** the preset's pixel ratio cap (`high` 2, `medium` 1.5, `low` 1) is the single largest lever on Apple GPUs; the march steps and the extras are second order in orbit. The governor has to be able to change preset (ADR 0304), and its evidence has to be the frame interval, with the timestamps scaled by what the interval showed.
- Per-pass GPU shares need per-pass timestamp queries, which three r186 sums into one pool. The plan 251 ablation (`refs/graphics-performance/07-m5-baseline.md` §2) is still the per-feature breakdown: on the M5 at Retina no single `high` extra is above 2.6 ms except MSAA.

## 2. The frame on the CPU

`profile-frame.ts`, WebGPU, `medium`, governor off, 10 s (CPU sampled every 0.2 ms; allocations sampled every 16 KB, garbage included):

| | orbit (607 frames) | pad (392 frames) |
|---|---|---|
| main thread busy per frame | 3.56 ms | 5.16 ms |
| of it, the browser's own `(program)` | 1.03 ms | 1.59 ms |
| garbage collection per frame | 0.13 ms | 0.12 ms |
| allocated per frame | 1174 KB | 1362 KB |

The largest functions, ms per frame (orbit):
- three's scene walk and matrices: `updateMatrixWorld` 0.19, `multiplyMatrices` 0.13, `_projectObject` 0.08;
- three's WebGPU submit path: `_renderObjectDirect` 0.12, `getForRender` 0.07, `writeBuffer` 0.08, `submit` 0.08, `setBindGroup` 0.04, about 0.6 together;
- the snapshot message: `worker.onmessage` 0.15 (pad 0.28);
- zod parses: 0.18.

The largest allocators, KB per frame (orbit):

| Allocator | KB per frame | Note |
|---|---|---|
| navball `visibleRuns` | 167 | |
| zod parses | about 250 | |
| navball `qRotate` | 114 | |
| navball `elevationCircle`, `meridian`, `groundRegion`, `horizonDirection` | about 110 | |
| snapshot message | 48 | pad 108 |
| three's `getDynamicCacheKey` | 31 | |

- **The main thread is not what holds the frame on the M2.** 3.6 ms of 16.7 in orbit; the frame waits on the GPU and the present (§1). CPU work matters on weaker machines, with several vessels, and as GC pauses.
- **The churn is the HUD's, not the renderer's.** About half the 1.2 MB a frame is the navball's curve math and zod parses on the HUD's staging and module paths. It does not cost much GC time per frame (0.13 ms). But it drives the heap's high-water mark: an 869 MB `usedJSHeapSize` reading on a page whose live heap is 88 MB (plan 362's journal), the same order as the 930 MB the owner's overlay showed. It also makes the occasional major GC longer.

## 3. Switches the governor makes

| Switch | longest frame in the next 1–1.5 s, before | after plan 362 |
|---|---|---|
| render scale 1 ↔ 0.85 | = steady frame (18 / 33 ms) | = steady frame |
| medium → low | 1517 ms | 83 ms (low warmed) |
| high → medium | 3167 ms | warmed at load when the governor starts on high |
| low → medium | 200 ms | 117 ms |

- A render-scale change reallocates the targets but builds no pipeline: three r186 keys pipelines by the target object, not its size. No sub-rectangle rendering is needed.
- A preset change rebuilds the vessel's part models (a new factory) and, unwarmed, the planet variant and every object's pipelines for the new sample count's targets: 1.5 to 3 s on the M2.

## 4. Techniques that fit three r186 (WebGPU and the WebGL2 fallback)

What exists, what is missing, and what fits. File references are to `packages/renderer/src`.

**Culling.**
- three's frustum culling is on for parts and the site.
- The planet and moon passes are fullscreen (`frustumCulled = false` by design).
- The site's detail has distance ranges (`SITE_DETAIL_RANGE`: tufts 600 m, rocks 3 km, trees 12 km, structures 40 km; `site.ts`) and instanced cells that frustum culling drops (`site-meshes.ts`), so in orbit the site costs nothing.
- Missing:
  - horizon culling for vessels and the site behind the planet's limb (cheap: one dot product per object group);
  - occlusion culling, which three r186 does not offer. A planet game's only big occluder is the planet, so horizon culling covers it.

**LOD and impostors.**
- Vessel parts have none except glTF parts (`THREE.LOD`, `parts/gltf-provider.ts`).
- Far vessels could drop to the `low` detail models (the factory already builds them per preset), and to a billboard beyond a few kilometres.
- The site has near and far dish models.

**Instancing and merging.**
- Each part is already a merged mesh per part (`parts/builder.ts`), with materials shared by slot and colour (`parts/materials.ts`).
- What is left is the vessel level: about 350 draws for Kronos V + Selene at `medium`, repeated by the shadow pass. `BatchedMesh` (three r186) keeps per-part matrices and visibility in one draw per material: plan 367.

**Pipelines and materials.**
- three builds one pipeline per object × render target, so the number to keep small is the distinct materials and targets.
- Plan 362 measured a preset change at 1.5–3.2 s unwarmed (new part factory, new planet variant, a new sample count's targets).
- Rules that hold (ADRs 0248–0290):
  - never toggle `castShadow` or a light's visibility (it rebuilds shaders);
  - keep meshes in the scene and hide them through a uniform or a draw range rather than `visible` when they will come back;
  - warm what a switch will need behind a loading screen.

**Caching.**
- Done:
  - the biome and terrain maps are baked;
  - the cloud shadow is a baked map on `medium` and `high` (plan 252);
  - the image light is recaptured at most every 1.5 s;
  - the sky's LUTs are of plan 261.
- Open:
  - a static shadow map for the site (plan 369);
  - temporal reprojection of the clouds and the march at half rate. ADR 0248 holds this until a measurement shows the march holding the frame, which this pass did not (in orbit the GPU timestamps are 6 ms).
  - The planet-sky session (plan 364) is moving the skybox and the scaled-space bodies to baked cube maps cached in IndexedDB: the same principle.

**Textures.**
- The parts' textures are procedural `DataTexture`s of 128 / 256 / 512 px by preset; the planet's colour map is 512 / 1024 wide.
- KTX2 / Basis is wired only for mod glTF models (`apps/web/scripts/copy-basis.ts`, the lazy KTX2 loader).
- For the coming Earth textures (plan 364):
  - ship KTX2 with UASTC for normal maps and ETC1S for albedo;
  - budget about 64 MB of GPU texture memory on `medium` (the M2's unified memory is shared with the page);
  - stream mips by distance;
  - never keep a decoded PNG on the main thread.

**Render scale against preset.**
- On Apple GPUs the preset's pixel ratio cap is the largest cost: `high` 2.0, `medium` 1.5, `low` 1.0. That is 5.7, 3.2 and 1.4 Mpx on a 14" screen.
- A preset's other costs do not scale with resolution.
- The governor lowers resolution a little (to 0.85) and then the preset (ADR 0304).
- A further idea: the pixel ratio as its own axis between presets (`medium` at 1.75), worth trying with plan 368's measurements.

**Frame pacing and battery.**
- `requestAnimationFrame` follows the display: 120 Hz on the M5's ProMotion, 60 on the M2.
- The frame-rate limit (Display / 60 / 30) is a setting now.
- Drawing stops while the tab is hidden: rAF stops, and the world layout pauses the sim (`tabHidden` → `clockState`).
- Chrome's Energy Saver caps rAF at 30 below 20 % battery (research 07). The governor's 30 Hz throttle check keeps quality there instead of sinking it.
- Next: default the limit to 60 on battery, through `navigator.getBattery()` where the browser has it.

**Memory.**
- The live JS heap is about 90 MB in the owner's scene.
- The 900 MB readings are garbage between collections (§2). Cutting the per-frame churn (§5 items 4–5) lowers the peak.
- GPU memory is mostly the render targets. By arithmetic, not a measurement: one half-float colour target at 3024 × 1890 is 46 MB, twice that with 2× MSAA, plus depth and the post chain's targets. At `medium` (2268 × 1417) each is about 56 % of that. A 2048² depth shadow map is 16 MB. Plan 368's frame capture should read the real figure.
- Nothing disposes shared part geometries until the world ends, by design (they are cached by definition).

## 5. Ranked

Gain is for the owner's machines (Apple silicon, Retina, WebGPU). Cost: S under a day, M a few days, L a week or more.

| # | Item | Gain | Cost | Status |
|---|---|---|---|---|
| 1 | Governor steps presets, floor 0.85 per preset, next preset warmed at load | owner's case 25 → 60 fps; switch 1.5 s → 0.08 s | S | done (362) |
| 2 | Frame-rate limit, Automatic draws at the display's rate | Automatic reads like a fixed preset; battery option | S | done (362) |
| 3 | Calibrated GPU-time evidence; the steady-judder rule with its guard | no retries into a stall; 50–54 fps judder → a preset that holds 60 | S | done (362) |
| 4 | Navball curves: the vessel's axes once per curve | navball `stroke` chain 285 → 99 KB a frame | S | done (363) |
| 5 | `describeModule` parses a part's config once (cached per module and config object) | about 40 KB a frame; the descriptor's own zod check (about 185 KB a frame, the HUD's `vesselThrottle` and the vessel panel each frame) is the next cut: describe throttled to the HUD period, or the check run once per module and shape | S | done (363), next step open |
| 6 | The Retina frame end on Apple GPUs (MSAA resolve, target formats, pass count) | the largest unmeasured cost: `high` 33 ms frames on 6–9 ms of GPU work | M | plan 368 |
| 7 | Vessel parts per material (`BatchedMesh`) | ~350 → ~40 draws for Kronos V, half the shadow pass's draws | M–L | plan 367 |
| 8 | Snapshot transport (binary transforms, transferable) | 0.15–0.28 ms and 50–110 KB per frame now, grows with vessels | M | plan 365 |
| 9 | Static site shadow map | GPU time at the pad | M | plan 369 |
| 10 | Horizon culling of vessels and the site | small in orbit, more with many vessels | S | not planned yet |
| 11 | KTX2 Earth textures, texture budget | memory and load time for plan 364 | M | with plan 364 |
| 12 | Temporal clouds and march at half rate | waits on a measurement that shows the march holding the frame (ADR 0248) | L | held |

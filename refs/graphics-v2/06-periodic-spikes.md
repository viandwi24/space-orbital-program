# 06 — Periodic frame spikes at 140–180 fps

Owner report: Windows (Chrome/Edge) and an M2 MacBook Pro average 140–180 fps, with a freeze every few seconds. The Perf HUD screenshots (`reference/owner-spikes/`) show WebGPU · medium · 100 %, 180 fps / 5.6 ms, 63–64 draw calls, about 932k triangles, a regular dip in the frame graph, and **JS heap 403 → 248 → 380 MB**. In `space-center-blurred.jpg` the Space Center drops to 89 fps with a steady 11.2 ms frame (every second vsync at 180 Hz) and blurry ground, while the HUD still says medium 100 %.

Read-only audit of `main` at 698ffe58. Nothing was measured; the confidence levels below are estimates.

## What the evidence rules out

- **The memory number is the JS heap, not GPU memory.** It comes from `performance.memory.usedJSHeapSize` (`apps/web/src/lib/perf/perf-stats.ts:116-120`). Render targets and textures do not count toward it. A 150 MB drop is a V8 major GC, not a bake being evicted.
- **There is no bake/evict manager and no memory budget.** No code evicts anything, and `rg -i "evict|lru|budget"` in the renderer finds only `effects/wreckage.ts`. Plan 403's scaled-space bake (`tsl/scaled-space.ts:82-107`) rebakes only when its key changes: the terrain epoch plus the biome map's uuid (`tsl/planet-pass.ts:550`). That happens on a site or preset change, never on a timer. The blurry ground therefore cannot be an eviction falling back to low resolution; see suspect 3.
- **Draw calls and triangles stay constant**, so the scene content is not changing.

## Ranked suspects

| # | Source | Period | Cost | Confidence |
|---|---|---|---|---|
| 1 | Background preset warming forced by `requestIdleCallback` timeouts | ≤ 2 s, for minutes after load | 20–150 ms per round, plus render-target reallocation | High |
| 2 | Major GC of a JS heap churning about 150 MB | Seconds (allocation rate / heap limit) | 10–60 ms final pause | High that it occurs; medium on who allocates |
| 3 | Lost TAAU state, or the Windows boot preset, behind a label that still says "medium" (the blur and the 89 fps) | Sticky, or until the boot swap | GPU frame doubles | Medium |
| 4 | Governor pacing on displays above 144 Hz | Continuous (uneven pacing) | Draws at about 90 fps instead of 165/180 | High (by reading the code) |
| 5 | Governor steps (flight only) | ≥ 30 s up-gap, 5 s judder window | Render-target reallocation; a TAAU key not seen before builds a new post chain | Medium |
| 6 | Autosave | 60 s | Extra full frame + canvas readback + JPEG + IndexedDB write | High that it occurs; 15–60 ms |
| 7 | Terrain patch rebake | Every ~717 m of ground track (about 3–7 s in low flight) | Patch passes, up to 8 ms on the M5 at high (cube + both patches) | Medium (flight only) |
| 8 | Cloud map rebake | ≤ every 2 s of wall time while the weather moves (more under warp) | One full-sphere noise bake | Low–medium |
| 9 | Ground rocks rebuild below 150 m | Every 6 m of camera movement; cache cleared at 60k cells | ≤ 4 ms of cell generation plus thousands of small objects | Low–medium (rover, landed) |

### 1. Background warming runs as forced long tasks

`precompile()` (`packages/renderer/src/renderer-webgpu.ts` ~667-773) keeps working after the loading screen:

- stage 1: the boot swap (Windows only);
- stage 2: the other planet scale;
- stage 3: each entry in `warmPresets`, warmed twice (`for (const name of asked …)` ~753);
- then vegetation (~763-772).

Each stage is `warmRounds` (~629-660), which runs up to 30 rounds. Every round awaits `idle()`, and `idle()` is `requestIdleCallback(…, { timeout: 2000 })` (`:464-469`). An uncapped 180 fps loop leaves the main thread almost no idle time, so every round fires on the 2 s timeout as a forced task. Inside that task a round:

- calls `applyPreset(name, true)` and then `applyPreset(own, true)` (`:645`, `:651`). Each call runs `applySize()` → `gpu.setSize` (`:237-245`), so every render target is reallocated twice;
- draws several whole frames: `viewFrames`/`planetFrames` (~595-620), sunlit and as they are, plus every view;
- swaps preset-sized part scenes in and out (`model.warmPartScene`).

With up to 30 rounds per stage and several stages, that comes to minutes of "a freeze every 2–3 s". It matches the report and the screenshot clock (T+00:59).

- **Confirm:** Debug → Info → **Copy load report** shows `compiles.phase` / pipelines still compiling. The perf overlay dip stops once the phase reads `play` and the vegetation stage has finished. In DevTools Performance, the long task's stack will contain `warmRounds`.
- **Fix:**
  - Give `idle()` a frame-budget fallback that does not force a task: no `timeout`, or a 50 ms `setTimeout` that only runs when the last rAF finished under budget.
  - Cap the rounds per stage, for example 5.
  - Do not reallocate the drawing buffer for a warm preset: warm into an offscreen target at the preset's size, or skip `applySize` when only pipelines are wanted.
  - Pause warming while a page is uncapped at a high rate, or spread the warming frames over several tasks.

### 2. Major GC (the 150 MB heap swing)

The JS heap climbs by about 150 MB and then collects. Allocations found:

- **Space Center page:** `JSON.stringify` on every snapshot, at 62.5 Hz (`TICK_MS = 16`, `apps/web/src/lib/sim-host.ts:36`). Locations in `routes/(world)/space-center/+page.svelte`:
  - economy, twice (`:222`);
  - the whole site, twice (`:236`);
  - `[draws, view]` after a full `homeSiteDraws` rebuild (`:263-266`);
  - labels on every drawn frame, at 180 Hz (`:522`).
- **Every page:** structured-clone deserialisation of a snapshot every 16 ms (`sim-client.ts:129-132`). Several holders keep each snapshot for one or two scavenges: the page, the decoder, `world-renderer.svelte.ts:604`. Medium-lived objects like these get promoted to old space and grow the heap that the major GC later collects.
- **Per frame:** `new Matrix4()` (`environment.ts:585`), and the governor's `window()`/`trim()` `slice`/`filter`/`map` over about 1,500 samples (`quality-governor.ts:645-670`, `estimateCadence` `:497-503`).
- **Rocks:** each rebuild allocates per-rock `vec` objects (`ground-rocks.ts:135-160`).
- **Warming (suspect 1):** builds part scenes and frames that hold large typed arrays.

How to confirm and fix:

- **Confirm:** in DevTools Performance with "Memory" ticked, the dip lines up with a *Major GC* event. Memory → *Allocation sampling* over 20 s ranks the allocating functions.
- **Fix:**
  - Replace the `JSON.stringify` diffs with version counters, since the snapshot delta already keeps unchanged objects identical: compare by reference.
  - Run `drawSites` only when `s.sites` changed by reference.
  - Diff labels numerically.
  - Reuse scratch matrices.
  - Use ring buffers in the governor (as `FrameWindow` already does).

### 3. Blurry ground at 89 fps while the label says "medium 100 %"

`renderer.preset` returns `requested` (`renderer-webgpu.ts:914`), not the preset being drawn (`presetDrawn`, `:858`). The HUD's "100 %" is the render scale only; TAAU is not shown. Medium draws with TAAU at 0.5 (`presets.ts:171`). Without TAAU, the planet pass falls back to the pixel-budget half path, which is blurry, while the scene renders at full resolution with MSAA, which costs more (89 fps). Two ways this happens:

- **(a) The flight governor's TAAU override leaks.** `applyLevel` calls `setTaau(level.taau)` (`flight-loop.ts:1627`). Low's rungs carry `taau: 0` ("off"), so a drop to low sets `taauOverride = 0`. When a page next takes the shared renderer, `acquire` resets only the render scale (`world-renderer.svelte.ts:376-377`), not TAAU, the planet scale or the governed preset.
- **(b) The Windows first-load boot preset.** `bootPresetFor` (`load-log.ts:137-154`) draws `low` until the background swap, and the HUD says "medium" the whole time.

How to confirm and fix:

- **Confirm:** Copy load report → `presetDrawn` and `boot.booting`. In Graphics changes, look for a governor drop earlier in the session.
- **Fix:**
  - In `acquire`, reset `setTaau(null)`, `setPlanetScale(1)` and the governed preset.
  - Have the HUD show `presetDrawn` and the TAAU scale.

### 4. Pacing above 144 Hz (flight)

`DISPLAY_RATES` stops at 144 (`quality-governor.ts:122`). A 165 or 180 Hz screen snaps to 144, and with the cap set to "display", `paceFps` is 144 (`:382-387`). `tick` skips a rAF when `sinceRender < 0.9 × 6.94 = 6.25 ms` (`:522-536`). That skips every 5.56/6.06 ms rAF, so flight draws every second rAF (about 82–90 fps), with stretches of back-to-back draws whenever the rAF timing jitters.

- **Confirm:** Debug → Frame pacing, and the histogram p50 at about 11 ms in flight.
- **Fix:** add 165/180/240 to `DISPLAY_RATES`, or skip pacing entirely when `cap === null`.

### 5. Governor steps (flight)

A step calls `applyLevel` (`flight-loop.ts:1618-1650`), which does the following:

- `setRenderScale` → `applySize` reallocates every target;
- `setTaau` → `syncPipeline` (`renderer-webgpu.ts:188-235`) builds a new `RenderPipeline` the first time a TAAU key appears. Warming draws only the current key, so the scene pass MRT and the TAAU pipelines are compiled during play;
- it posts a "Graphics adjusted" notice and writes `localStorage`.

Each step-up is followed by a 6 s probe; a failed probe drops again (`DEFAULT_GOVERNOR` `:204-224`). At a 120 target with the budget at 8.3 ms, `sustainedShare120 = 6 %` lets the spikes from suspects 1, 2 and 6 cause drops, so the governor can oscillate between rungs every 30–40 s.

- **Confirm:** Debug → Graphics changes, which lists each step with its time.
- **Fix:**
  - Warm every TAAU key of the ladder in `precompile`.
  - Exclude single isolated spikes (GC) from the judder rule, for example by requiring two or more over-budget frames in a row.

### 6. Autosave (every 60 s)

The trigger runs on a 1 s timer (`routes/(world)/+layout.svelte:590-594`; `autosave.ts:14`). Each save:

- calls `collectSave`, which draws an extra full frame and then `captureThumbnail` (`flight-loop.ts:2370-2372`): a `drawImage` of the WebGPU canvas (a synchronous GPU readback) plus `toDataURL('image/jpeg')` on the main thread (`save/thumbnail.ts:28-38`);
- then the worker's `save()` is cloned back to the main thread;
- then it is written to IndexedDB along with `entries()` and a metadata read.

- **Confirm:** the spike lands at a 60 s period; the long-frame log shows `thumbnail`/`flight-loop`.
- **Fix:**
  - Take the thumbnail with `createImageBitmap` + `OffscreenCanvas.convertToBlob` in the worker, or skip it for timer autosaves.
  - Serialise the save in the worker and hand over an ArrayBuffer.

### 7–9. Bakes and rocks (flight, low altitude)

- **Terrain patches.** The fine patch spans 4,096 m (`terrain-patch.ts:13`) and is rebaked once the camera has moved 0.35 of its half-span, about 717 m (`:17`, `:75-79`). The bake is in `tsl/terrain.ts:200-206`. Journal 068 measures cube + both patches at 8.0 ms on the M5 at high.
  - Fix: bake a patch over two frames, or ahead of time (pre-centre in the direction of travel).
- **Cloud map.** `stepCover` allows one step per 2 s of wall time (`weather.ts:51-62`, `environment.ts:578`), and each step rebakes the full map (`tsl/clouds.ts:275-283`).
  - Fix: bake it in tiles across frames.
- **Rocks.** Rebuilt every 6 m (`ground-rocks.ts:28`); `cache.clear()` at 60k cells (`:132`) causes a burst of regeneration.
  - Fix: evict the cache by distance instead of clearing it; reuse the vector scratch objects.

## How the owner can catch the source in the game

1. **Perf overlay** (Settings → Interface): the "ms" peak, plus memory. A drop in memory at the moment of the spike means GC (suspect 2).
2. **Debug → Info, kept open.** Long Animation Frames (`debug/long-frames.ts:86-93`) are collected only while this tab is open (`DebugPanel.svelte:263-273`, with `buffered: true`). The panel lists frames over 50 ms with the script and function names: `warmRounds`/`drawFrame` points to suspect 1, `captureThumbnail` to suspect 6. A GC pause or a GPU-only stall shows as a long frame with no script.
3. **Debug → Copy load report:** `compiles.phase`, the pipelines still compiling, `presetDrawn`, `boot`.
4. **Debug → Graphics changes / Frame pacing:** governor steps and their timing (suspects 4 and 5).
5. **The most decisive test:** a 20 s DevTools Performance recording with Memory ticked shows Major GC events, `warmRounds` tasks and `requestIdleCallback` timeouts together.

Quick A/B: set the frame cap to 60. If the spikes disappear, suspect 1 is confirmed: `requestIdleCallback` then gets idle time and stops forcing the warm tasks.

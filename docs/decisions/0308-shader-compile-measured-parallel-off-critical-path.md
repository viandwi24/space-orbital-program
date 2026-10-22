# 0308 — Shader compile at world load: measured, in parallel, and off the critical path

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/370-shader-compile-at-world-load.md
**Amends:** ADR 0290 point 3 (the warm-up draws its frames with async pipelines) and ADR 0304 point 1 (the governor's next preset is warmed after the loading screen, not behind it)

## Context

On Windows the world takes more than a minute to load: Chrome, RTX 3060, both loading steps "Starting the graphics" and "Compiling graphics programs". On Apple Silicon it takes about 10 s.

Chrome on Windows translates every shader to HLSL:
- WebGPU: Tint, then DXC on D3D12 (since Chrome 121 on SM 6 hardware), FXC otherwise;
- WebGL: ANGLE, then FXC on D3D11.

Both compilers are known to be slow on very large shaders and on loops. FXC unrolls a loop that contains an implicit-derivative sample, or fails when it cannot.

What our load did on WebGPU:
- The holder's first frame and the warm-up frames drew with three's sync pipeline path (`device.createRenderPipeline`). Chrome compiles those one after another on the GPU process's main thread, and the next submit waits for them.
- The planet pass alone is six materials per preset (full, half, edge, upsample, prepass, scaled-space bake), each a few thousand lines of WGSL.
- The warm-up of plan 362 compiled a second preset's set before the world showed.

Nothing told us which pipeline cost what, on which backend, or whether Chrome's shader cache was used.

## Decision

1. **A compile report.** `packages/renderer/src/compile-report.ts`.
   - On WebGPU it wraps the device's `createShaderModule` and pipeline calls. It records each module's label, size and source hash, and each pipeline's mode and, for async ones, the time to resolve.
   - On WebGL (both the GLSL renderer and WebGPURenderer's WebGL2 fallback) it wraps `shaderSource` and `linkProgram`. With `KHR_parallel_shader_compile` it polls `COMPLETION_STATUS_KHR` for each program's time.
   - The world renderer adds its load steps, the backend, the adapter and the ANGLE string, and the browser.
   - First or cached load: a hash of the shader set, kept in `localStorage`. A set seen before in this browser should come from Chrome's shader cache.
   - Modules whose source is new since the previous load are counted. That catches a per-load value in a shader string, which would defeat the cache.
   - The loading screen shows the pipelines left. The report itself is in Debug → Info (Copy load report), in the stored load logs (point 7) and in `window.__orbitalLoadReport()`.
2. **Async pipelines while loading.** Until the world is ready, three's renderer creates new render pipelines with `createRenderPipelineAsync`: the renderer passes a collecting array to `Pipelines.getForRender`. Dawn compiles them on worker threads, in parallel. A draw whose pipeline is not ready is skipped by three's `isReady`, so the hidden warm-up frames just ask for pipelines.
   - The warm-up repeats its frames until no pipeline is pending, then draws one more frame of each view on the sync path. That frame finds everything built, and the bakes that only run once draw in it.
   - One-shot bakes (`QuadMesh` draws into their own targets) stay on the sync path, so a bake is never skipped and then marked done. Only the scene's meshes and the planet's per-frame prepass and half-size quads go async.
   - After the world is ready the sync path is back, because a skipped draw in play would flicker. `RendererDebug.asyncPipelines` turns async mode on or off for tests.
3. **Smaller planet shaders, built once.** Measured first. The planet pass had no implicit-derivative sample in a loop, so FXC was not forced to unroll. It was 932 KB of WGSL in one `main`, because TSL inlines every helper.
   - The noise (`pcg3d`, value noise, `noiseF3`) and the cube-atlas lookup are laid-out WGSL functions. They read no uniforms.
   - The sun's shadow map is read through one swappable texture node. A variant is keyed by having the taps or not, so a new map size or a preset without shadows no longer rebuilds every variant. The first build waits a few frames for the map.
   - Texture nodes that are swapped later start on separate placeholders: three merges uniforms of the same texture into one binding.
4. **The next preset off the critical path.** The governor's next preset (ADR 0304) is warmed after the loading screen has gone, with async pipelines, while the world is shown. Its pipelines compile in the background, and the preset's frame is drawn into the hidden holder only when they are ready. A governor step before then builds as before.
5. **No per-load values in shader strings.** three names buffer uniforms after a global node id (`NodeBuffer_1348856`), so the source changed between loads. The device wrapper renumbers those names per module (`stableShaderNames`) before the source reaches the browser. The report's "changed since the last load" count must be 0 on a reload; `measure-shader-compile.ts` dumps both loads to compare.

6. **A loading screen that never looks frozen** (the owner, 2026-10-22: "at least don't make the tab not responding or stuck, show something").
   - `WorldLoading.svelte` shows the game's own shots full screen, crossfading every 7 s with a slow pan (no pan with reduced motion), plus a caption and a rotating tip at the bottom left.
   - The progress sits in the bottom-right corner: a spinning ring, the step and "2 / 5", the shaders ready of those asked for, the one compiling now, a thin bar and the elapsed time.
   - Everything that moves is a CSS animation of transform or opacity. The compositor runs it while the page's thread is busy.
   - After 15 s a "Taking long? Continue with lower quality" button switches to `low` and saves it. The warm-up stops waiting for the old preset's pipelines, and no background preset is warmed.
   - The pictures come from `scripts/capture-loading-slides.ts`: the game's renderer at 1920 × 1080, WebP in `static/loading/`, no outside art.
7. **Load logs in the browser, a Developer page** (the owner: no copy button on the loading screen; keep the logs and read them from the main menu).
   - Every world load writes its log to `localStorage` (`orbital.loadLogs`, the last 20, about 1.5 MB at most). It is written every few seconds while loading, at ready, on an error, and when the tab is left on the loading screen.
   - Each log has the report, the outcome, the step it reached, whether lower quality was chosen, any error, and the 200 slowest pipelines.
   - `/developer` (a small item on the main menu) lists the logs, opens one, copies one or all as text, downloads `.json` and clears them. The part and crew viewers moved there from the Mods page, which links to it. Debug → Info still copies the current load's report.

## Alternatives considered

- **Always async in play (skip a draw until its pipeline is ready).** It removes every hitch, but a light toggle would make the vessel vanish for a frame or more. Kept as a debug switch, not the default.
- **Ship precompiled HLSL or DXIL.** The web has no such path; Chrome's own disk cache is the only cache.
- **A cheap boot preset on a first load on Windows.** Left until the owner's Windows report shows it is still needed after the size cut. The background warm-up of point 4 is the mechanism it would use.
- **Uniform loop bounds for all presets (one planet variant for all).** It removes the per-preset variants, but every preset then pays for the biggest shader, and the GPU cost of dynamic loops on the march is unmeasured. Revisit if the Windows report shows the variant count dominates.

## Consequences

- The owner can paste one report from a Windows machine. It says which backend, which compiler path (the ANGLE string names D3D11 or D3D12), which pipelines were slow, and whether the cache was used.
- Loading compiles in parallel on machines whose browser has worker threads for pipeline creation. The loading screen counts down the pipelines left.
- The governor's first preset step during the first seconds of play may still build once, as before plan 362.

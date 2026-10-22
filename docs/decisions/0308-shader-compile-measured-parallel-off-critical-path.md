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
   - The report is shown on the loading screen (pipelines left, a Copy report button), in Debug → Info (Copy load report) and in `window.__orbitalLoadReport()`.
2. **Async pipelines while loading.** Until the world is ready, three's renderer creates new render pipelines with `createRenderPipelineAsync`: the renderer passes a collecting array to `Pipelines.getForRender`. Dawn compiles them on worker threads, in parallel. A draw whose pipeline is not ready is skipped by three's `isReady`, so the hidden warm-up frames just ask for pipelines.
   - The warm-up repeats its frames until no pipeline is pending, then draws one more frame of each view on the sync path. That frame finds everything built, and the bakes that only run once draw in it.
   - One-shot bakes (`QuadMesh` draws into their own targets) stay on the sync path, so a bake is never skipped and then marked done. Only the scene's meshes and the planet's per-frame prepass and half-size quads go async.
   - After the world is ready the sync path is back, because a skipped draw in play would flicker. `RendererDebug.asyncPipelines` turns async mode on or off for tests.
3. **Smaller planet shaders.** The planet pass's march loops sample with explicit levels (no implicit derivatives inside loops). Rarely used parts (aurora, light shafts) are not in a preset's shaders when that preset has them off. The size of every module is measured before and after in the research doc.
4. **The next preset off the critical path.** The governor's next preset (ADR 0304) is warmed after the loading screen has gone, with async pipelines, while the world is shown. Its pipelines compile in the background, and the preset's frame is drawn into the hidden holder only when they are ready. A governor step before then builds as before.
5. **No per-load values in shader strings.** The report's "changed since last load" count must be 0 on a reload; a test of the planet pass's WGSL builds it twice and compares.

## Alternatives considered

- **Always async in play (skip a draw until its pipeline is ready).** It removes every hitch, but a light toggle would make the vessel vanish for a frame or more. Kept as a debug switch, not the default.
- **Ship precompiled HLSL or DXIL.** The web has no such path; Chrome's own disk cache is the only cache.
- **Uniform loop bounds for all presets (one planet variant for all).** It removes the per-preset variants, but every preset then pays for the biggest shader, and the GPU cost of dynamic loops on the march is unmeasured. Revisit if the Windows report shows the variant count dominates.

## Consequences

- The owner can paste one report from a Windows machine. It says which backend, which compiler path (the ANGLE string names D3D11 or D3D12), which pipelines were slow, and whether the cache was used.
- Loading compiles in parallel on machines whose browser has worker threads for pipeline creation. The loading screen counts down the pipelines left.
- The governor's first preset step during the first seconds of play may still build once, as before plan 362.

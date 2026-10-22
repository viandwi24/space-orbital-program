# Shader compile at world load, and why Windows is slow (plan 370, ADR 0308)

Checked 2026-10-22. The owner's report: on Windows 10 (Chrome, i7 11th gen, RTX 3060, 16 GB), the deployed build stays on the loading screen for more than a minute ("Starting the graphics", "Compiling graphics programs"). A Mac M2 or M5 takes about 10 s.

## How Chrome compiles our shaders

| Backend | Path in Chrome on Windows | Compiler |
|---|---|---|
| WebGPU (our default) | WGSL → Tint → HLSL → D3D12 | DXC on SM 6 hardware since Chrome 121; FXC before that or without SM 6 |
| WebGL (`?renderer=webgl`) | GLSL → ANGLE → HLSL → D3D11 | FXC (`d3dcompiler_47`) |
| macOS | WGSL → MSL (Metal), or ANGLE → Metal | Apple's Metal compiler |

- Chrome 121 moved WebGPU on D3D12 from FXC to DXC. Google's note says DXC is faster than FXC (about 20 % on compute shaders in their tests), but both compilers still take time roughly in proportion to the size of the HLSL. Source: https://developer.chrome.com/blog/new-in-webgpu-121
- FXC unrolls a loop that contains an implicit-derivative sample (warning X3570), and fails with X3511 when it cannot. Dawn added and reverted a `[loop]` workaround because FXC miscompiled some loops into infinite loops. Sources: https://reshade.me/forum/shader-troubleshooting/10043-ganossamotionfocus-doesnt-compile and Dawn's Tint test expectations (`test/bug/tint/*.expected.hlsl`).
  - Our planet pass has **no implicit-derivative sample**: all 97 samples are `textureSampleLevel`, so no loop is forced to unroll. The loops are not the problem; the size is.
- Sync `createRenderPipeline` is compiled on the GPU process in order, and the next submit waits for it. `createRenderPipelineAsync` lets Dawn build pipelines on worker threads, side by side.

## What we measured (Apple M2 in this session, Chrome 156, WebGPU, headed, `apps/web/scripts/measure-shader-compile.ts`)

Kronos V + Selene on the pad, a fresh Chrome profile, then a second load in the same profile (Chrome's disk cache). The data is in `refs/graphics-performance/data/m2-plan370-*.json`.

| | before (c510fffd) | after (plan 370) |
|---|---|---|
| WGSL shader source at load | **11.2 MB**, 170 modules | **3.6 MB**, 164 modules |
| Planet pass fragment shader | 932 KB, 16,700 lines, 2 functions, 791 inlined copies of the pcg3d hash | 217–263 KB, 9,000 lines, laid-out noise functions |
| Pipelines at load (Automatic, start `low`) | 115, 113 sync | 120, 87 async (the warm-up) |
| /flight → loading screen gone | 22.2 s (2nd load 19.0 s) | 7.0 s (2nd load 7.0 s) |
| Same at `high` | 30.7 s, 11.1 MB, 148 pipelines | 9.1 s, 4.5 MB, 120 pipelines |
| Modules whose source changed between two loads | not measured (see below) | 0 of 164 |

On Windows, where compile time grows with HLSL size, cutting the shader source to about a third, and the planet shaders to a quarter, should matter more than it does on Metal. Only the owner's report (below) can confirm it.

## What was wrong, and what plan 370 changed

1. **Everything inlined.** TSL inlines a `Fn` without `setLayout`, and a plain JS helper, at every call. The planet pass was one `main` of 16,700 lines. `pcg3d`, the value noise, `noiseF3` and the cube-atlas lookup are now laid-out WGSL functions (`tsl/noise.ts`, `tsl/cube-atlas.ts`). They read no uniforms, so the r186 limitation that keeps `terrain.ts`'s samplers inlined does not apply.
2. **The planet pass was built three times at load.** Its variants were dropped whenever the sun's shadow map changed (a preset with another shadow size, or the first map). `low` (no shadows) was built, then rebuilt with shadow taps after the governor's next preset made a map. Now the shadow map is read through one swappable texture node, and a variant is keyed only by having the taps or not. The first build waits up to 8 frames for the map when the shadow is wanted.
3. **The scaled-space atlases and the terrain patches shared one placeholder texture.** three merges uniforms of the same texture, so a variant built before the first bake had one binding where it needs two. Its source then differed from a load where the bake came first, and it read the normal atlas from the albedo one until rebuilt. Each now has its own placeholder.
4. **`NodeBuffer_<global id>`.** three names buffer uniforms after a global node id, which shifts with timing. That changed 14 modules' source between two loads and defeated Chrome's cache. `stableShaderNames` renumbers them per module before the source reaches the device.
5. **Sync pipelines at load.** Until the world is ready, the renderer passes three's `Pipelines.getForRender` a collecting array, so new pipelines use `createRenderPipelineAsync` (or `KHR_parallel_shader_compile` on the WebGL2 fallback) and their draws are skipped until built. The warm-up repeats its frames until nothing is pending, then draws them once on the sync path.
   - One-shot bakes (full-screen quads other than the planet's per-frame prepass and half pass) stay sync, so none is skipped and marked done.
6. **The governor's next preset is warmed after the loading screen** (ADR 0308 point 4), async. Each round ends with a frame of the player's preset in the same task, so the canvas never shows the other preset.
7. **The part materials of every other preset were `compileAsync`'d into the canvas target**, which three does not reuse for the scene pass's targets (plan 261). That was wasted compile work, and it was removed.

## The load report, and how the owner sends it from Windows

The world's loading screen has a **Copy load report** button, and the bar counts "N of M shader pipelines ready". In the game, **Debug → Info → World load → Copy load report** copies the same text. `window.__orbitalLoadReport()` in the console returns it too, and it is logged to the console when the world is ready.

The report has:
- the build, the browser and platform, threads and memory;
- the renderer and adapter, and the WebGL renderer string. On Windows that string names ANGLE's D3D11 backend and the GPU;
- the start preset and the one now;
- whether this browser compiled these shaders before (first or cached), and the modules changed since the last load (should be 0);
- the time of each loading step;
- the pipelines (async and sync) and the shader source size;
- the time span per phase, the slowest compiles and the largest shaders.

The async times run from the request until the pipeline is ready, so they include waiting behind other compiles. The phase span is the wall time.

To compare a first and a cached load on Windows:
1. Open the game and enter a world. When it shows, copy the report (Debug → Info → Copy load report).
2. Reload the page (F5) and enter the world again. Copy the second report.
3. Send both. A first load can be repeated by clearing site data, or in a new Incognito window, which starts with an empty shader cache.

## Next, if the Windows report still shows long compiles

- The terrain samplers in the planet pass are still inlined. A 150-line block, most likely the root finding with its height reads, appears 4 times. Laying them out needs the r186 uniform-in-function issue worked around, with the textures passed in or read once outside.
- `low` as a boot preset on a first load on Windows, then the player's preset compiled in the background and swapped in. The mechanism is there: the background preset warm-up of ADR 0308 point 4.
- The scaled-space bake (92 KB) and the sky-map bake still compile sync at load.

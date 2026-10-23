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

The loading screen counts "N of M shaders ready", names the one compiling and shows the elapsed time. Every load's log is kept in the browser (the last 20, including loads that were abandoned on the loading screen). They are listed on the **Developer** page (main menu, bottom row), where one or all can be copied as text or downloaded as `.json`. In a world, **Debug → Info → World load → Copy load report** copies the current one. `window.__orbitalLoadReport()` in the console returns it too, and it is logged to the console when the world is ready.

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
1. Open the game and enter a world, and wait for it to show (or close the tab if it is stuck: the log keeps the step it reached).
2. Reload the page (F5) and enter the world again.
3. Main menu → Developer → **Copy all as text** (or **Download all .json**), and send it.

A first load can be repeated in a new Incognito window, which should start without the disk shader cache (not verified), but an Incognito window also keeps its own logs, so copy them from its Developer page before closing it.

## The owner's Windows report (2026-10-23)

Chrome 154, Windows 10, RTX 3060, WebGPU (the ANGLE string says D3D11 for WebGL), `high`, first load, build after plan 370's first push. The data is in `refs/graphics-performance/data/win10-rtx3060-plan370-first-load.json`.

- **20.1 s** to the world (was more than a minute): device 1.9 s, compiling 18.2 s; 45 pipelines, 1.85 MB of WGSL.
- The critical path is the planet pass: full 14.6 s (269 KB fragment), the then unnamed half-size pass 9.8 s (266 KB), the march prepass 5.5 s (23 KB, most of it waiting behind the two). Parts take 0.5–1.2 s each.

The async times include queueing behind other compiles, so the half pass competed with the full one for the same workers.

### A local proxy for Chrome's D3D12 path

Dawn's `tint` (WGSL → HLSL, the translator Chrome uses) and Microsoft's `dxc` both build on macOS (`scratchpad` builds of Dawn and DirectXShaderCompiler at their main branches, 2026-10-23). For a planet fragment shader:

- Tint emits its loops as `while (true)` without `[loop]`. Adding `[loop]` to every loop changes neither the DXIL size nor the DXC time, so DXC does not unroll them.
- DXC itself takes about 1.6 s on the M2 for the `high` full pass (180 KB of DXIL). On Windows the rest of the 14.6 s is the NVIDIA driver compiling the DXIL to machine code, plus waiting for a worker. DXIL size is the best local proxy for that.
- DXIL has no function calls, so the laid-out WGSL functions of plan 370 are inlined again. Fewer call sites, not smaller WGSL, is what shrinks it.

The `high` full planet pass with features removed (`tint` + `dxc -T ps_6_0`):

| Variant | WGSL | DXIL | DXC |
|---|---|---|---|
| `high` | 271 KB | ~180 KB | 1.66 s |
| no shafts or no aurora | 260 KB | 175–178 KB | 1.7 s |
| ground octaves 4 | 265 KB | 173 KB | 1.56 s |
| `low`'s settings | 212 KB | 151 KB | 1.39 s |
| no terrain march | 185 KB | 128 KB | 1.12 s |
| minimal (no terrain, 1 cloud step, no shafts, aurora or shadows) | 156 KB | 111 KB | 1.10 s |

The terrain march is the largest single piece (about 30 % of the DXIL). Everything else is spread over the surface shading, the sky and the clouds, so getting under 120 KB means splitting the pass, not trimming it.

### What the follow-up changed (plan 370, second round)

- Every material has a name in the logs: `planet-full·high`, `planet-half·high`, `planet-edge`, `planet-upsample`, `planet-prepass`, `planet-scaled-bake`, the terrain, moon, cloud and sky bakes, and the effect twins.
- At load only the planet scale in use is compiled. The other scale (the governor's half-size rung) builds in the background after the loading screen.
- A preset with shadows has its shadow taps from the first build (a cleared 1 × 1 depth target until the sun's map exists). Before, a load built the planet once without shadows (no vessel yet, map view) and again with them.
- On a first load on Windows of a build this browser has not loaded before, the world shows with `low`. `low` has no post chain, no MSAA, and a planet pass about 16 % smaller in DXIL. The player's preset compiles in the background and is swapped in when ready. `localStorage` `orbital.graphics.boot` = `low` or `off` forces it either way. The log says "Boot: drew low first; high swapped in N s after the loading screen".

Expected on the owner's PC:
- the world in roughly 10–12 s on a first load instead of 20 s: one `low` planet variant (about 16 % less driver work) with nothing else of its size competing;
- `high` some 15–20 s later in the background;
- a second load should be much shorter if Chrome's shader cache holds, which needs the owner's second-load log to confirm.

## Next, if the Windows report still shows long compiles

- The terrain samplers in the planet pass are still inlined. A 150-line block, most likely the root finding with its height reads, appears 4 times. Laying them out needs the r186 uniform-in-function issue worked around, with the textures passed in or read once outside.
- Split the planet pass: the terrain march and the sky/clouds as separate passes, so no single pipeline is the whole planet (the critical path on D3D).
- A boot variant without the terrain march (128 KB DXIL instead of 151 KB), if the owner accepts the hills appearing a few seconds after load.
- The scaled-space bake (92 KB) and the sky-map bake still compile sync at load.

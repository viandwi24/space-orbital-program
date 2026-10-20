# 05 — WebGPU: status, cost of moving, recommendation

## Browser status (October 2026)

| Browser | WebGPU | Source |
|---|---|---|
| Chrome / Edge | Since 113 on macOS, Windows and ChromeOS; Android 121; Linux 144/147 | [S19, S23] |
| Safari | Safari 26.0 "adds support for WebGPU" on macOS, iOS, iPadOS and visionOS; WebKit says it supersedes WebGL there. Whether it is on by default on macOS Sequoia/Sonoma with Safari 26 is **unverified** | [S21] |
| Firefox | Windows since 141; Apple Silicon Macs since 147 (January 2026); Intel Macs, Linux and Android not yet in stable | [S19, S22] |
| Reach | About 87 % of users (caniuse, August 2026, as cited by [S19]) | |

## three.js WebGPURenderer and TSL (r184–r186)

**Recent changes:**
- r184 added a NodeMaterial compatibility layer for WebGLRenderer and about 3× faster TSL compilation.
- r186 added `SunLight` with cascaded shadows and node materials in `WebGLRenderer.compile()`.
- r183 renamed `PostProcessing` to `RenderPipeline` [S18, S19].

**Gaps in WebGPURenderer:**
- No `ShaderMaterial`, `RawShaderMaterial` or `onBeforeCompile`.
- No `EffectComposer`.

**Fallback:**
- It falls back to WebGL2 once, at `init()`.
- The fallback lacks storage textures, indirect draws and workgroup memory.
- Shipping both renderers grew one test bundle from 220 to 307 KB gzipped [S19].

**Performance is not automatically better.**
- In an r173 test on an M1 Pro, 20,000 non-instanced cubes ran at about 15 fps against about 60 fps on WebGLRenderer. A maintainer blamed per-object uniform-buffer churn [S20].
- Gains come with compute and many instanced draws.

## What moving would cost us

From the audit ([01](01-diagnosis.md), counted 2026-10-19):

- **Shader code to port:**
  - **about 3,170 lines of GLSL** in template strings: `planet.glsl.ts` 1500, `moon.glsl.ts` 454, `terrain.glsl.ts` 332, effects 267, atmosphere 168, others;
  - `ShaderMaterial` in 12 files;
  - `onBeforeCompile` patches in `weathering.ts` and `moon.ts` (part and moon materials).
- **Pipeline pieces to replace:**
  - the post chain: three's `EffectComposer` + `UnrealBloomPass` + `OutputPass`, to become a TSL `RenderPipeline`;
  - the terrain bake: a `WebGLCubeRenderTarget` with face-by-face rendering;
  - MSAA `WebGLRenderTarget`s;
  - `readPixels` in the benchmark and the parity checks;
  - the `EXT_color_buffer_float` / `OES_texture_float_linear` checks. On WebGPU, filtering 32-bit float textures needs the optional `float32-filterable` feature; a manual bilinear fallback already exists.
- **Shader-level blockers:**
  - the planet pass samples three's shadow map as `sampler2DShadow`;
  - it writes `gl_FragDepth` with three's log-depth constants;
  - it uses `#include` chunks;
  - it calls `dFdx`/`dFdy` inside non-uniform branches, which WGSL's uniformity analysis rejects unless the diagnostic is turned off.

**Estimate:**
- **40–80 hours of agent time:** 10–20 XL-sized pieces, including look parity on every screen (flight, Space Center, Hangar, map, moons) and a WebGL2 fallback for browsers without WebGPU.
- **Plus owner time** to sign off the look.
- **Risk:** a long period of two renderers or a regression-prone big switch.

## Recommendation

- **Avoid now. Improve later.**
  - Phases 1–4 of [06](06-plan-and-cost.md) take the per-pixel work out of the frame on WebGL2. That is where our cost is, not driver overhead: our draw count is modest.
  - WebGPU's real gains for us are compute (noise and cloud textures, LUT building, terrain patches) and timestamp queries. Both matter once the per-pixel work is fixed.
- **Before the release:** keep new shader work portable.
  - Constants come from TypeScript twins, as they already do.
  - Avoid new `onBeforeCompile` hacks.
  - Isolate the noise and atmosphere functions so they can become `wgslFn`/TSL nodes.
- **After the release:** a spike plan that ports one pass (the sky LUTs from Phase 2, which are new and small) to TSL on WebGPURenderer behind a flag, and measures it on the M2 and M5. Decide the full move from that number.

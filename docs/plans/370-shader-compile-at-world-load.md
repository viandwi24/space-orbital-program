---
id: 370
title: "Shader compile at world load: measured, in parallel, smaller, off the critical path"
status: in-progress
owner: "shader compile session (youthful-pike worktree)"
depends: [340, 362, 364]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 370 — Shader compile at world load: measured, in parallel, smaller, off the critical path

## Goal

The owner reported on 2026-10-22 that on Windows 10 (Chrome, i7 11th gen, RTX 3060, 16 GB) the deployed build stays on the world's loading screen ("Starting the graphics", "Compiling graphics programs") for more than a minute. On a Mac M2 or M5 it takes about 10 s.

The likely cause is Chrome on Windows translating our shaders to HLSL and compiling them with Microsoft's compilers:
- WebGPU: Dawn → D3D12 → DXC (FXC before Chrome 121, or without SM 6);
- WebGL: ANGLE → D3D11 → FXC.

Both are slow on huge, loop-heavy shaders such as the planet pass. ADR 0308 has the design.

## Context

- ADRs 0247–0249 (WebGPU renderer, one pipeline per object × render target), 0290 (one world renderer, warm-up at load, plan 340) and 0304 (the governor's warmed preset, plan 362).
- `packages/renderer/src/renderer-webgpu.ts` `precompile`, `tsl/planet-pass.ts` (variants full, half, edge, up, pre, bake per preset), `shaders/planet.glsl.ts`, `apps/web/src/lib/world-renderer.svelte.ts`.
- `refs/graphics-performance/`.

## Steps

1. **Instrument.** `packages/renderer/src/compile-report.ts`:
   - On WebGPU, wrap the device's shader-module and pipeline calls: each module's label, size and hash; each pipeline's mode (sync or async) and, for async ones, its time.
   - On WebGL, wrap `linkProgram` and poll `KHR_parallel_shader_compile` for each program's time.
   - World load steps with times.
   - Backend, adapter, ANGLE string and browser.
   - First or cached load: has this browser seen this shader set before?
   - Modules whose source changed since the last load.
   - Shown in the loading screen (pipelines left, Copy report) and in Debug → Info (Copy load report); `window.__orbitalLoadReport()`.
2. **Measure** on the M5 with `apps/web/scripts/measure-shader-compile.ts`: WGSL sizes, pipeline count and times, first and second load.
3. **Compile in parallel.** The warm-up asks for every pipeline with `createRenderPipelineAsync` (three's async path, for the scene's real targets). The device compiles them on worker threads, and the loading screen counts them down.
4. **Cut compile cost.** Measure WGSL/GLSL size before and after:
   - no implicit-derivative sampling or large constant-bound loops in the march loops;
   - rarely used branches out of the boot shaders;
   - fewer variants compiled at boot;
   - shared chunks de-duplicated.
5. **Off the critical path.** The world shows once the start preset's pipelines are ready. The governor's next preset is compiled after the loading screen, in the background (async), not before. On a first load on Windows, only the preset in use is warmed.
6. **Cache.** Check that the second load is faster on Chrome. Make sure no per-load value (seeds, timestamps) goes into a shader string.
7. **Document** in `docs/research/shader-compile-windows.md`, with how the owner sends a report.

## Acceptance criteria

- [ ] The loading screen shows the pipelines left and has a Copy report button. Debug → Info has the load report. Checked in a browser on the M5.
- [ ] `measure-shader-compile.ts` on the M5: before and after numbers in the research doc. No load-time regression on the Mac.
- [ ] The second load reports "cached", and no module changed between two loads.
- [ ] The research doc tells the owner how to send the Windows report.
- [ ] `bun run docs:check`, `bun run test` (unit), `bun run typecheck`, `bun run build` pass.

## Docs checklist

- [ ] STATUS board row, journal 370, ADR 0308 in the index, research doc, stack-versions note for the Chrome/Dawn facts.

## Log

- 2026-10-22 — Written and started (ADR 0308).
- 2026-10-22 — Measured on the M2 (Chrome 156, WebGPU): 11.2 MB of WGSL at load, the planet fragment shader 932 KB. After laid-out noise, one build per preset, separate placeholders and stable names: 3.6 MB; load 22.2 → 7.0 s (auto), 30.7 → 9.1 s (high); 0 of 164 modules changed between two loads. No implicit-derivative sample in a loop, so step 4's first item needed no change. The low boot preset of step 5 is deferred until the owner's Windows report shows it is needed. Journal 370, research `shader-compile-windows.md`.

# 0359 — Pipelines, shader programs and node states are kept alive

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/342-first-map-toggle-and-post-load-hitch.md
**Builds on:** ADR 0290 (the world's views are warmed at load), ADR 0310 (every pipeline is built at load or in the background)

## Context

Plan 340 left a first Flight → Map of 150 ms and a 567 ms frame after the loading screen. Measured again on the M5 (`scripts/measure-first-frames.ts`, Chrome, `medium`, WebGPU and WebGL): the first Flight → Map took **4.5 s**, each later Map → Flight 0.5 to 1.3 s (the planet pass and every material compiled again, the same pipeline ids each time), and four frames of 200 to 420 ms came in the 8 s after the loading screen. With TAAU off the numbers were the same shape (a 7.3 s frame, 0.5 to 1.2 s toggles).

## Findings

Three disposes a render object when its cache key changes (`RenderObjects.get`: the key includes the scene's environment and lights, which the map view changes), and `Pipelines` and `Nodes` release what the object held when its use count reaches zero: the GPU pipeline, the shader module and the built node state. Entering the map therefore disposed about sixty render objects; coming back built them again, in JS (the TSL builder) and on the GPU. The map's warm-up pipelines (ADR 0290) were released the same way as soon as the flight view drew again, which is why the first toggle was still slow after the warm-up.

## Decision

Nothing is released before the renderer goes (`keepPipelines` in `renderer-webgpu.ts`): `Pipelines._releasePipeline` and `_releaseProgram` do nothing, and `Nodes.delete` adds one use to the render object's built node state first so that its count never reaches zero. The retained set is the shaders and states the session has used (the warm-up builds the other presets' on purpose). A pipeline of a render object whose material really went stays in memory until the page closes.

## Consequences

- WebGPU: no frame over 100 ms in the 8 s after the loading screen (was four, up to 417 ms), Map → Flight 19 ms (was 1349 ms), the second Flight → Map 19 ms (was 555 ms); WebGL: no frame over 100 ms except the first Flight → Map (237 ms, was 293 ms).
- The first Flight → Map on WebGPU is 126 ms (a 78 ms frame that compiles twin-line and a few mesh pipelines, and a 126 ms frame without a compile: the map HUD's first mount); it was 4.5 s. The last compiles belong to objects that exist only in the map and are not in the warm-up's snapshot: open.
- Memory grows with the distinct shaders and states of a session; a mod that builds thousands of materials would keep them. A cap with the oldest dropped is the follow-up if that is seen.

## What else the measurement found (the same plan)

Measuring the governor's steps (`measure-sunrise.ts`, the new `profile-governor-step.ts`) found three more causes of hitches, fixed here:

1. **The TAAU share was part of the post chain's key** (`0:0.5:taau0.6`), so every rung built a new scene pass, a new render context and the pipelines of every material again (about 0.5 s); ADR 0338's claim that a rung builds no pipeline was only true after this. The key is now `0:0.5:taau`; the scale of the kept pass changes in place (`setResolutionScale`): the rungs cost 34 to 84 ms (the target reallocation), measured.
2. **The warm-up did not draw the governor's variants.** The governor's rung at load (`high`, native) forced TAAU off while the other presets were warmed, so the TAAU planet variant of `medium` was built in flight (0.5 to 1.5 s), and `high` with TAAU was never warmed. Another preset is now warmed with its own share, and `RendererConfig.warmTaau` (0.75 on a tier that locks at 120) warms the presets whose own share is none once with TAAU on, with the post chain synced to it.
3. **The plume cluster lights were added and removed with the plume look** (plan 400, `writeClusterLights`): a warm-up frame at `low` removed the three point lights and the next frame made three new ones, and the lights are part of every lit material's cache key, so each warm round rebuilt every lit shader (0.45 to 0.65 s per round, about 30 rounds) and each preset step did too. Found by bisecting the step from the start of the day's work (15 ms) to `f501409a` (590 ms). The pool now stays in the scene at intensity 0 when off, as `LampPool`'s note says of lamps.

Numbers (M5, WebGPU, the booster at the pad): a governed step to `medium` 600 to 800 ms → 16 ms; the background warm-up 41 to 48 s → 3.2 to 3.4 s.

## Still open

A step to `low` in the sunrise runs (the booster in orbit at 50×) still shows one frame of 460 to 1215 ms on WebGPU (three `MeshBasicMaterial` pipelines the pad's warm-up does not draw) and, on WebGL, 0.9 to 1.2 s that was already 0.9 s at the start of the day.

# 0336 — TAAU: the 3D image at half the side, rebuilt temporally

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/393-taau.md
**Builds on:** ADR 0330 (graphics v2 and 120 Hz), ADR 0248 (the WebGPU frame), ADR 0310 (every pipeline is built at load), ADR 0234 (the planet pixel budget)

## Context

On the M5 the frame is about pixels (plan 392's baseline): at `medium` the direct path gave a p50 of 15 to 16 ms at 3 km and 69 to 83 fps; WebGL held 120 fps only at a third of the pixels. three r186.1 ships `TAAUNode`, a temporal upscaler that takes a low-resolution jittered image with depth and velocity and rebuilds the canvas's resolution.

## Decision

1. **A preset setting, `taau`**: the 3D image's side as a share of the canvas's, 0 for off. WebGPU only (`backend === 'webgpu'`; the WebGL2 fallbacks keep the direct path). `medium` is **0.5**; `low` has no post chain and `high` stays 0 until the other costs of `high` are down (see the numbers below).
2. **The pipeline.** The scene pass renders at the share (`PassNode.setResolutionScale`) with MSAA off and a velocity output (`mrt({ output, velocity })`); `TAAUNode` resolves colour, depth and velocity to the canvas's size; bloom and the output read the resolved image; the HUD draws after. The pipeline is keyed by the share, so a preset change swaps a kept pipeline (ADR 0310: built at load with the presets).
3. **The planet is a mesh in the scene pass**, so it draws at the low resolution without a pass of its own: its `half`/`edge` upsample is not used under TAAU (`forceScale = 1`, the pixel budget is the scene's). Two things make it work with a jitter:
   - the full pass's rays read the camera's own projection inverse at draw time (`cameraProjectionMatrixInverse`) instead of the CPU copy made before the jitter was set, so the jitter moves the planet's rays with the meshes';
   - the planet's **velocity** is its own: from the pixel's depth and the last frame's camera (rotation, up vector, altitude, unjittered projection) it reprojects the ground point, or for the sky the direction, and writes the difference of the two clip positions. A screen quad's own velocity would be none. It is a second material (`fullTaau`, the same shader plus `mrtNode`) used only while the scene pass has a velocity output: a material with an `mrtNode` in a pass without one lost its colour output (the pipeline failed to build).
4. **Camera cuts** (`taau-cuts.ts`): the history starts again when the view changes (map or flight, the vessel followed), the pipeline or the canvas size changes, the field of view jumps more than 25 %, or the camera turns more than 1.2 rad in a frame. The resolve is reset by shrinking its history target, which makes `TAAUNode` seed it again with a bilinear upscale of the current frame; the planet forgets its previous camera. A zoom, a slow turn and a time warp are not cuts: the velocity covers them, and the node drops the history of a pixel whose velocity is over 128 px.
5. **Not done here:** FSR 1 on cut frames and on the WebGL2 path; keeping the targets at their maximum size so that a scale change allocates nothing (three sizes its pass target from the scale, so a scale change reallocates; the governor's use of TAAU is plan 395); the thin and additive effects (plumes, plasma, orbit lines) are drawn into the low-resolution image and resolved with it. The look check showed no ghosting on the vessel at rest or while the camera turns, but a roll under thrust was not looked at.

## Numbers

M5, Chromium, 1512 x 945 at device scale 2, governor off, 15 s per cell, the machine at load 2 when the run started and 4 to 6 during it. p50 / p95 frame interval in ms, then mean fps:

| preset | view | off: p50 / p95 ms, fps | TAAU 0.6 | TAAU 0.5 |
|---|---|---|---|---|
| high | pad | 16.7 / 25.0, 57 | 24.1 / 26.1, 47 | 16.7 / 25.0, 59 |
| high | 3km | 16.7 / 25.0, 61 | 24.7 / 32.0, 45 | 16.7 / 25.7, 59 |
| high | 12km | 15.7 / 33.2, 69 | 16.5 / 58.4, 55 | 9.2 / 50.0, 70 |
| high | orbit | 8.3 / 10.2, 120 | 8.3 / 10.3, 117 | 8.3 / 10.0, 120 |
| medium | pad | 8.3 / 10.2, 120 | 8.3 / 10.1, 120 | 8.3 / 10.3, 120 |
| medium | 3km | 16.6 / 18.2, 69 | 8.4 / 18.2, 82 | 8.3 / 16.7, 106 |
| medium | 12km | 8.4 / 32.7, 83 | 8.3 / 50.0, 87 | 8.3 / 16.4, 102 |
| medium | orbit | 8.3 / 10.3, 120 | 8.3 / 10.3, 120 | 8.3 / 10.3, 120 |

At `medium` TAAU at 0.5 turns 3 km from 69 fps into 106 and 12 km from 83 into 102 with p95 at 16.4 ms; the pad and the orbit were already at 120. 0.6 helps less. At `high` TAAU does nothing at 0.5 and is worse at 0.6 (47 fps at the pad): its frame is not pixel-bound (the 4096 shadow map, the cloud and terrain settings), and the resolve at the canvas's size and the history copy add work. `high` with TAAU is a question for 394 to 398.

## Consequences

`medium` on a WebGPU device draws the 3D image at half the side and keeps the canvas's sharpness from temporal accumulation. MSAA is off there (the resolve does the anti-aliasing). The WebGL renderer and `high` are unchanged. A rolling vessel under thrust and the look of a plume at speed are the next places to look.

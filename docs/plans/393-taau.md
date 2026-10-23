---
id: 393
title: "TAAU: the 3D image at about 0.6 of the side, rebuilt temporally; MSAA off; FSR 1 on cuts and on WebGL2"
status: in-progress
owner: "Worker A"
depends: [392]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 393 — TAAU

## Goal

The 3D image renders at about 0.6 of the canvas side and is rebuilt to full Retina with temporal anti-aliased upscaling (TAAU). MSAA is off, the planet pass's own bilinear upsample is gone, and FSR 1 covers camera cuts (no valid history) and the WebGL2 path. This is the wave's largest single GPU saving: pixels are about 70 % of the frame.

## Context

- Read: `refs/graphics-v2/02-browser-120fps.md` §3 (TAAU row [B16], FSR 1 row [B17], dynamic resolution [B18]) and §5 item 1 (expected −40 to −55 % of GPU work plus the MSAA resolve). `refs/graphics-v2/03-renderer-and-mod-audit.md` A1: the planet pass's `half` / `edge` / upsample variants (`packages/renderer/src/tsl/planet-pass.ts:2600-2614`), the planet pixel budget 1.75 Mpx (`packages/renderer/src/presets.ts:84`), the scene `RenderPipeline` with MSAA capped at 2 (`renderer-webgpu.ts:152-177`, `presets.ts:90`), A3 (MSAA −1.9 ms).
- three in this repo is 0.186.1. It ships `examples/jsm/tsl/display/TAAUNode.js`, `FSR1Node.js`, `TRAANode.js` and `examples/jsm/tsl/utils/TAAUtils.js` (checked 2026-10-24). Verify the API (`currentFrameWeight`, depth and velocity inputs, `PassNode.setResolutionScale`) against that copy before writing code.
- Baseline and tools: plan 392's note `refs/graphics-v2/05-m5-120hz-baseline.md` and its per-pass timestamps.
- ADRs: 0330 point 2, 0248, 0308 and 0310 (every pipeline compiled and warmed at load; governor steps build nothing), 0249 (WebGPU and WebGL renderers).

## Scope

**In:**
- The scene pass and the planet pass render into one jittered input at a resolution scale (default about 0.6 of the side) and are resolved by `TAAUNode` to the output size.
- Velocity output for moving meshes (vessel, site, debris; TSL `velocity` MRT); the planet pass's motion is camera-only and gets its reprojection from depth.
- MSAA off on the TAAU path; the planet pass's `half`/`edge`/upsample replaced by the shared TAAU input.
- History handling: reset on camera cuts (warp, map toggle, launch, scene change), disocclusion tuning, thin-geometry ghosting (orbit lines, antennas, plumes drawn additive after the resolve if needed).
- Jitter and history ordered against the existing passes: bloom and output read the resolved image; the HUD and overlays draw after.
- FSR 1 (`FSR1Node`, EASU + RCAS) on frames without valid history and on the WebGL2 path.
- A screenshot comparison and the owner's look check.

**Out:**
- The governor's use of the scale (395); tile-GPU pass hygiene (394); temporal clouds (397).
- e2e tests (paused by the owner).

## Design notes

- Keep the render targets at the maximum size and change only the active scale, so a scale change allocates nothing and builds no pipeline (three r186 keys pipelines by target, not size; 02 §3).
- Additive and transparent effects without reliable velocity (plumes, plasma, smoke) may draw after the resolve at output size or into the input with a reactive mask; decide by screenshot.
- Every new pipeline (TAAU, FSR 1, the velocity MRT variants) is warmed at load with the presets (ADR 0310). An ADR records the TAAU design (what draws before and after the resolve, the cut rules).

## Steps

1. Read three 0.186.1's `TAAUNode`, `FSR1Node` and `TAAUtils` and record the API in `docs/research/stack-versions.md`; ADR for the design.
2. Velocity output for meshes; jitter on the camera projection.
3. One shared jittered input for the planet and scene passes at a resolution scale; remove the planet upsample and MSAA on this path.
4. `TAAUNode` resolve; bloom and output after it.
5. Cut detection and history reset; FSR 1 on cut frames and on WebGL2.
6. Warm the new pipelines at load; `measure-sunrise.ts` with `STEP_TO`.
7. Measure with 392's tooling under `/tmp/orbital-heavy.lock`; screenshots; the owner's look check.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including unit tests for the jitter sequence, the cut detector (history reset on warp, map, launch and scene change), and that a resolution-scale change allocates no target and builds no pipeline.
- [ ] `measure-sunrise.ts` with `STEP_TO` shows no pipeline compiled on a scale change or a cut.
- [ ] Measured with 392's tooling on the M5, WebGPU `high`: GPU ms and p95 frame interval at pad/3 km/12 km/orbit, against the 392 baseline and the wave target p95 ≤ 8.4 ms, recorded in the journal. [manual: the M5 run]
- [ ] `capture-graphics.ts` screenshots before and after, in the journal: edges no worse than MSAA 2×, no ghosting on the vessel during a roll. [manual: the owner's look check]
- [ ] `bun run typecheck`, `bun run build` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/393-taau.md` written, with before and after screens and numbers.
- [ ] `docs/architecture/` renderer doc: the frame with TAAU and FSR 1.
- [ ] ADR for the TAAU design, linked above.
- [ ] `docs/research/stack-versions.md`: three's TAAU and FSR 1 APIs.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Worker A: ADR 0336. TAAU on WebGPU with the planet's own velocity, jittered planet rays and camera cuts; `medium` takes 0.5. Not done: FSR 1 on cuts and on WebGL2, a scale change that allocates nothing (three reallocates the pass target; the governor's use is 395), the owner's look check, the `capture-graphics.ts` before and after. Numbers in the ADR. `high` does not gain.

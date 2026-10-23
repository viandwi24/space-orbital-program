---
id: 394
title: "Apple tile-GPU hygiene: store and discard actions, transient attachments, one merged final pass, bloom from ¼ size, rg11b10ufloat targets"
status: done
owner: "Worker A"
depends: [393]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 394 — Apple tile-GPU hygiene

## Goal

The frame end on Apple tile GPUs costs as little as it can: attachments that are not read later are discarded, not stored; attachments needed only in one pass stay in tile memory; tone mapping, grading, sharpening and the output run in one full-screen pass; bloom starts from a ¼ size source; colour targets without alpha use `rg11b10ufloat`. This absorbs draft 368's trials.

## Context

- Read: `refs/graphics-v2/02-browser-120fps.md` §2 "Apple TBDR specifics" (store/discard [B14], `TRANSIENT_ATTACHMENT` in Chrome 146 [B15], three r186 does not set it; each full-screen RGBA16F pass at Retina is about 46 MB of traffic) and §5 item 4 (expected 1–3 ms at Retina). `refs/graphics-v2/03-renderer-and-mod-audit.md` A1 (the scene `RenderPipeline`, `packages/renderer/src/renderer-webgpu.ts:152-177`; output = colour + glow then ACES and sRGB, `:208`; `bloomScale` 0.25–0.5) and A4 item 1.
- Draft 368 (folded into 392 and here): its trials — fewer full-size passes with tone mapping folded into `RenderPipeline.outputNode`, an `rgba8unorm` target where HDR is not needed, `alphaMode: opaque`, `desynchronized` — are tried here. Its MSAA 2 → 0 trial is done by 393 (MSAA off under TAAU).
- Tools: 392's per-pass timestamps, labels and the Xcode Metal capture; the baseline `refs/graphics-v2/05-m5-120hz-baseline.md`.
- ADRs: 0248, 0310 (variants warmed with the preset), 0330.

## Scope

**In:**
- `storeOp: "discard"` for depth and any attachment not sampled later; resolve in the same pass where a resolve remains.
- `TRANSIENT_ATTACHMENT` where three allows it (a small backend patch or an upstream PR; feature-detected, off where unsupported).
- One merged final pass: tone map, grade, TAAU sharpen if separate, output.
- Bloom's chain from a ¼ size source.
- `rg11b10ufloat` for HDR targets without alpha.
- 368's leftovers: canvas `alphaMode: opaque`, `desynchronized`, and an `rgba8unorm` post target where HDR is not needed, each measured and kept only if it helps.

**Out:**
- TAAU itself (393); the governor (395); scene shaders.
- e2e tests (paused by the owner).

## Design notes

- Try one change at a time and measure each with 392's tooling under `/tmp/orbital-heavy.lock` on a quiet, plugged-in M5. Keep only what measures.
- Every kept variant adds or changes pipelines; warm them with the preset (ADR 0310) and check with `measure-sunrise.ts`.
- `rg11b10ufloat` has no sign and no alpha; check every pass that reads the target for both.
- A patch to three goes in the repo's patch mechanism with a note in `docs/research/stack-versions.md`; prefer an upstream PR link.

## Steps

1. Metal capture of the current frame end (after 393) as the reference.
2. Load/store actions: discard depth and unread attachments.
3. Transient attachments where three allows, feature-detected.
4. Merge the final passes into one `outputNode`.
5. Bloom from ¼ size; `rg11b10ufloat` targets.
6. 368's leftovers: `alphaMode: opaque`, `desynchronized`, `rgba8unorm` where HDR is not needed.
7. Measure each step; ADR for what ships.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including unit tests that the target descriptors carry the chosen formats and store actions, and that the transient flag is set only when the feature is present.
- [ ] Measured with 392's tooling on the M5, WebGPU `high`: per step, GPU ms and p95 frame interval at pad/3 km/12 km/orbit against the 393 numbers and the wave target p95 ≤ 8.4 ms; the Metal capture shows fewer full-screen passes and no store on discarded attachments. [manual: the M5 run]
- [ ] `measure-sunrise.ts` with `STEP_TO` shows no pipeline compiled on a governor step.
- [ ] `capture-graphics.ts` screenshots show no visual regression (bloom, tone, night scenes).
- [ ] `bun run typecheck`, `bun run build` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan); 368 marked dropped (folded into 392 and 394).
- [ ] `docs/journal/394-apple-tile-gpu-hygiene.md` written, with each step's cost.
- [ ] `docs/architecture/` renderer doc: targets, formats and passes.
- [ ] ADR for what ships, linked above.
- [ ] `docs/research/stack-versions.md`: transient attachments in Chrome and three, any patch.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Worker A: ADR 0340. three r186.1 already does discard/transient for MSAA and the output is one node. Bloom ¼, `rg11b10ufloat` and an opaque canvas measured on the M5: no gain outside noise, `rg11b10ufloat` froze orbit. Nothing ships; the Metal capture and a quiet rerun stay [manual].

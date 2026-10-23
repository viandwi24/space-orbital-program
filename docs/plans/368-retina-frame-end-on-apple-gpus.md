---
id: 368
title: "The Retina frame end on Apple GPUs: MSAA resolve, canvas format and pass count"
status: draft
owner: ""
depends: [363, 373]
phase: 8
created: 2026-10-22
updated: 2026-10-24
---

# 368 — The Retina frame end on Apple GPUs: MSAA resolve, canvas format and pass count

## Goal

A ranked item from plan 363's research (`docs/research/frame-budget-and-efficiency.md` §5). The owner asked for efficient rendering and a playable frame rate on 2026-10-22.

When this is done, the journal says what each full-size pass costs at Retina on the M2, and `high` at pixel ratio 2 draws at 60 fps, or the journal shows why it cannot.

## Context

- ADR 0248 and plan 362 measured, on the M2 in orbit: `high` at 3024 × 1890 drew 33 ms frames while GPU timestamps said 6–9 ms; `medium` at 2268 × 1417 drew 16.7 ms. These numbers predate plans 370, 373 and 380–384.
- What already shipped:
  - The WebGPU post chain is a TSL `RenderPipeline`: scene pass, bloom, and `outputNode = colour + glow` (`packages/renderer/src/renderer-webgpu.ts` ~152–177).
  - MSAA is capped at 2 from pixel ratio 2 (`msaaSamples`, `presets.ts` ~89).
  - Bloom is drawn at a preset scale (`bloomScale` 0.25–0.5).
  - The WebGL chain renders to a half-float target (`post.ts` ~98); the WebGPU scene pass is three's `pass()`, also half float.
- ADR 0304 and plan 362 (the governor), ADR 0310 (every preset's pipelines warmed; a governor step builds nothing).

## Scope

**In:** the frame end at Retina on Apple GPUs, on WebGPU.
**Out:** the scene's own shaders.

## Steps

1. Re-baseline `high` and `medium` at ratio 2 with `measure-auto-quality.ts` (ADR 0304, plan 362).
2. Profile one `high` frame with Safari's or Xcode's Metal frame capture, the only tools that see the tile resolves.
3. Try, one at a time, with frame intervals measured:
   - MSAA 2 → 0 at ratio 2, with an FXAA pass;
   - an `rgba8unorm` post target where HDR is not needed;
   - fewer full-size passes, with the tone mapping folded into the `RenderPipeline.outputNode` so no separate output pass runs;
   - the canvas's `alphaMode: opaque`;
   - `desynchronized`.
4. Each kept variant adds pipelines; warm them with the preset (ADR 0310).
5. ADR for what ships.

## Acceptance criteria

- [ ] `high` at pixel ratio 2 on the M2 in the owner's scene draws at 60 fps, or the journal shows what each step costs. [manual: the M2 run]
- [ ] `capture-graphics.ts` screenshots show no visual regression.
- [ ] `measure-sunrise.ts` with `STEP_TO` shows no pipeline compiled on a governor step.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; ADR for what ships.

## Log

- 2026-10-22 — Drafted by plan 363.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; MSAA cap at ratio 2, scaled bloom and the TSL `RenderPipeline` already shipped; open trials are MSAA 2 → 0 + FXAA and the rest; re-baseline first; new variants warmed per ADR 0310; depends adds 373.

---
id: 412
title: "WebGPU pipelines fail at flight load: more than 16 sampled textures per stage"
status: done
owner: "Worker B"
depends: []
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 412 — Pipelines over 16 sampled textures

## Goal

No render pipeline of the game samples more than 16 textures in a stage (WebGPU's default limit), at any preset and display scale, with one slot to spare. A pipeline that fails to build must not leave the flight page drawing without the planet's edge pass or retrying every frame.

## Context

- Found by Worker B while measuring the looks (2026-10-24): on the owner's Retina display (device pixel ratio 2) the flight page logged `Async render pipeline creation failed (planet-edge·high)`: 17 sampled textures against 16; `ShadowMaterial` and `MeshStandardNodeMaterial` failed after it ("Invalid BindGroupLayout"), because three shares the object bind group layout. It was there before plans 403 to 406 (checked at 99a4f004). A flight cell read p95 66 ms while it was on screen.
- Code: `packages/renderer/src/tsl/{planet-pass,terrain,lut-sky}.ts`, `texture-pack-model.ts`; `apps/web/scripts/probe-textures.ts`.

## Steps

1. A probe that hooks WebGPU (`createShaderModule`, `createBindGroupLayout`, `createPipelineLayout`, `createRenderPipeline[Async]`) and prints the fragment textures per pipeline layout and the pipelines created more than once.
2. Find the cause: at a pixel ratio of 2 the governor draws the half-size pass and its `planet-edge` variant, which reads the half-size target besides the 16 of the full pass.
3. Pack two pairs of textures: the terrain's fine and mid patches (one texture two patches wide), and the sky's transmittance and multiple-scattering tables (one texture side by side).
4. A gate: the probe with `--gate` fails above 15 textures or on any failed pipeline.

## Acceptance criteria

- [x] `bun test packages/renderer` passes, including `test/texture-pack.test.ts` (the packed lookups stay inside their own table or patch; the budget is one under the limit).
- [x] `probe-textures.ts --gate` passes on a development build at Low, Medium and High, at pixel ratios 1 and 2, and with the sample planet mod: the widest pipeline (`planet-edge·high`) has 15, the full pass 14.
- [x] The sky and the ground draw as before (journal screens `412-after-*.jpg`).
- [x] `bun run typecheck`, `bun run lint` and `bun run docs:check` pass.
- [ ] The pad's p95 at a pixel ratio of 2 re-measured on a quiet M5 (load 3 or less): the machine's load was 8 to 9 when this landed, so the number is Worker A's 410 table.

## Docs checklist

- [x] `docs/STATUS.md`, `docs/journal/412-pipelines-over-16-textures.md`, the ADR (0368).

## Log

- 2026-10-24 — Created and done by Worker B (ADR 0368).

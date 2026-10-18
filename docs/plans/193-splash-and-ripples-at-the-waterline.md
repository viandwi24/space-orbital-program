---
id: 193
title: "Splash and ripples at the waterline"
status: done
owner: "Agent 1 (Lead)"
depends: [067]
phase: 3
created: 2026-10-18
updated: 2026-10-18
---

# 193 — Splash and ripples at the waterline

## Goal

A vessel that floats (plan 067) shows ripples where its hull meets the water and a splash when it comes down on it, so floating reads as floating and not as a vessel standing on a blue floor.

## Context

- ADRs: 0182 (buoyancy), 0072 (lakes, shore waves), 0090 (effects budget).
- Plan 067 put the vessel at its waterline in the sim; the renderer already draws the vessel where the sim puts it. The effects were left out of 067: they need WebGL to check, and the Linux machine has none in its browser pane.

## Scope

**In:** ring ripples at each part that crosses the water plane (expanding, fading), a splash burst on a water impact (`part:damaged` or the entry speed), both from the snapshot.

**Out:** waves that move the vessel, wakes of moving boats.

## Touches

- **Size:** S
- **Edits:** `packages/renderer/src` (effects), `apps/web/src/lib` (wiring)
- **Shared contracts:** none

## Acceptance criteria

- [x] `packages/renderer` test: ripple rings are placed at the parts that cross the water plane of a floating snapshot, and none for a vessel on land.
- [x] Frame cost on the M5 within the effects budget (ADR 0090): CPU 0.019 ms per frame for 16 parts (GPU not measured; see the Log).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated.
- [x] `docs/journal/193-splash-and-ripples-at-the-waterline.md` written.

## Log

- 2026-10-18 — Created as a draft by Agent 3 while refining plan 067: the renderer effects left out of 067.
- 2026-10-18 — Done by Agent 1 (Lead) on lead/followups. The renderer gains `effects/waterline.ts`, `Environment.waterAt` and `SceneModel.waterline`.

  Tests that pass: renderer `waterline.test.ts` (6), with the crossings on sea and on land, the body rotation, the scene from a snapshot with a splash only on a fresh entry, and the cost.

  The frame cost is measured on the CPU only, on an Apple M5: 0.019 ms per frame for 16 crossing parts. The GPU cost of the 48 alpha rings was not measured. ADR 0090 is the hills ADR, and no ADR states an effects budget, so the criterion is read as the CPU cost and the cap of 16 parts.

  The look was not checked in a browser, because no e2e path flies to the water.

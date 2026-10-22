---
id: 362
title: "Automatic quality: preset steps on WebGPU, a resolution floor per preset, a learned start, calibrated GPU time and a frame-rate limit"
status: done
owner: "perf / auto quality session (Claude)"
depends: [261, 340, 253]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 362 — Automatic quality that matches a fixed preset

## Goal

The owner's report (MacBook Pro M5 14", 16 GB, on battery), Kronos V + Selene in a 100 km orbit:

- Quality Medium, "Adjust quality while playing" off: 100 fps.
- Quality Automatic with adjust on: falls to 25 fps, even after the governor drops the resolution to 55 %.

Their words: "itu kenapa yah? sepertinya ada keanehan ... jangan sampai grafis sudah bagus tapi ternyata performa game nya yang jelek, atau sebaliknya".

Automatic with adjust on must match or beat the fixed preset that holds 60 in the same scene.

## Context

- ADR 0248 and plan 261: the WebGPU governor changes resolution only (`governorPresetSteps: false`).
- ADR 0233 (plan 253): the governor's rules, pacing to 60 on a 120 Hz display.
- ADR 0290 (plan 340): the warm-up at world load; three r186 builds a pipeline per object and render target.
- `refs/graphics-performance/07-m5-baseline.md`: on the M5 the frame follows pixels at the pad; Energy Saver's 30 fps cap.
- ADR 0304 is this plan's design.

## Scope

**In:** `quality-governor.ts` (ladder floor per preset, `startAt`, frame cap and `paceFps`, work-time calibration), `renderer-webgpu.ts` (preset steps on, other presets' warm frames, GPU meter fix), `apps/web/src/lib/graphics.ts` (learned level, ceiling, frame cap), `flight-loop.ts` (governor plan), Settings → Graphics (frame-rate limit), `scripts/measure-auto-quality.ts`.

**Out:** the research and the larger items of plan 363 (culling, merging, LOD, allocation churn, texture budgets).

## Steps

1. Measure the owner's scene before any change: WebGPU and WebGL, fixed medium and high with adjust off, high and Automatic with adjust on (`scripts/measure-auto-quality.ts`).
2. ADR 0304.
3. Governor: `PRESET_FLOOR_SCALE`, `startAt`, `setFrameCap`/`paceFps`, `calibrateWork`; tests.
4. WebGPU: warm frames for the preset the governor moves to first (`warmPresets`), with its part models in view; `governorPresetSteps: true`; the meter divides by the frames in the pool.
5. Web: learned level per backend, Automatic's ceiling and start, the frame-rate limit setting; every Flight visit starts the governor from the plan.
6. Measure again, same script, before and after builds interleaved.

## Acceptance criteria

- [x] `bun test packages/renderer/test/quality-governor.test.ts` passes (40), including the plan 362 block: no rung below 0.85 above `low`; "high 40 ms, medium 10 ms" ends on medium within 6 s and holds 60; `startAt`; the frame-rate limit at 120 Hz (Display every rAF, 60 every second, 30 every fourth, also with the governor off); a work time that under-reads 3× raises nothing; the judder rule and its guard.
- [x] `bunx vitest run src/lib/graphics.test.ts` (apps/web): learned level parsing, start preset, ceiling, frame cap, warm presets (8 pass).
- [x] The owner's scene on this machine (M2, 60 Hz, AC), WebGPU: Automatic with adjust on draws 60.0 fps at `medium` in every run, fixed medium 60.0 (journal table; one disturbed run read 55.6 for fixed medium).
- [x] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` board row.
- [x] `docs/journal/362-auto-quality-fix.md` with the before/after table.
- [x] ADR 0304 and its index row.
- [x] `refs/graphics-performance/README.md`: what shipped.

## Log

- 2026-10-22 — Started. Baseline in the journal.
- 2026-10-22 — Done. Before/after in the journal; the M5 at 120 Hz is not verified (owner's machine).

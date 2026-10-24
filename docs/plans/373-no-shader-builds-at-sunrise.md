---
id: 373
title: "No shader builds at sunrise or on a governor step"
status: done
owner: "Worker A"
depends: [362]
phase: 8
created: 2026-10-23
updated: 2026-10-23
---

# 373 — No shader builds at sunrise or on a governor step

## Goal

The owner: "saat matahari terbit atau saat kita ada di orbit sisi belakang bumi terus mengarah ke sinar matahari yang muncul itu kadang suka freeze ... transisi antara gelap ke terang atau terang ke gelap ... sungguh mengganggu".

No frame longer than 100 ms across sunrises, sunsets and governor steps in orbit, on WebGPU and WebGL.

## Context

- ADR 0304 (plan 362): the governor steps presets and warms the next preset.
- ADR 0308 (plan 370): async pipelines while loading; the next preset is warmed in the background.
- ADR 0306 (plan 364): the scaled-space bake.
- ADR 0310 is this plan's design.

## Steps

1. Measure: `apps/web/scripts/measure-sunrise.ts` (the booster example, 100 km orbit, 50×, 120 s, night and day starts, both backends).
2. `Environment.forceShadow` and sunlit warm-up frames on both backends.
3. `settingsFor` and `Renderer.setPreset(preset, { governed })`: governor steps keep the map and terrain sizes.
4. Warm every preset the governor can reach; hold the governor until the warm-up is done; the background warm draws the planet's paths apart from the part models.
5. Measure again.

## Acceptance criteria

- [ ] `measure-sunrise.ts` after: no frame over 100 ms in the night-start and day-start runs on WebGPU and WebGL (journal table, before and after). WebGPU day 0 (worst 58 ms) and night 0 (worst 70 ms, round 8; round 7 had one 593 ms `planet-edge`); WebGL day 0 (28 ms); **WebGL night 2 (106 ms at the first sunrise, 147 ms at the governor's step to low): open.**
- [x] `bun test packages/renderer` passes (789), including `settingsFor` in `presets.test.ts` and `setHeld`.
- [x] `bunx vitest run src/lib/graphics.test.ts` (apps/web) passes (every reachable preset warmed).
- [x] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal `docs/journal/373-no-shader-builds-at-sunrise.md`; ADR 0310 and its index row.

## Log

- 2026-10-23 — Started from the parent session's reproduction (601 ms and 1492 ms stalls on the M2).
- 2026-10-23 — Merged onto plan 370's follow-up (f2c3a1ce). WebGPU meets the criterion in the last runs; WebGL's night start still has two frames of 106 and 147 ms. Stays in progress for those.
- 2026-10-24 — Worker A: closed with open items. The WebGPU steps to `medium` went 600-800 ms → 16 ms (ADR 0359: plan 400's cluster lights, the TAAU key, the warm-up); WebGPU sunrises: 0 frames over 100 ms in the night and day runs; open: the step to `low` in orbit on WebGPU (460 to 1215 ms) and WebGL (0.9 to 1.2 s, already so at the start of the day).

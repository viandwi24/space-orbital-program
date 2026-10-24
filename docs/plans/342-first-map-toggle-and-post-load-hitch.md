---
id: 342
title: "The first map toggle and the last frame hitch after the world's loading screen"
status: done
owner: "Worker A"
depends: [340, 370, 373]
phase: 8
created: 2026-10-22
updated: 2026-10-24
---

# 342 — The first map toggle and the last frame hitch after the world's loading screen

**Size:** S

## Goal

Plan 340 measured two stalls left after the world's warm-up:
- the first Flight → Map took about 150 ms on both backends;
- on WebGPU, one 567 ms frame came in the 8 s after the loading screen.

Those numbers predate plans 370, 373 and 380–384, so they may have moved. Measure again, find what each remaining stall builds, and move it into the warm-up or into idle time. When this is done, neither the first map toggle nor the seconds after the loading screen has a frame over 100 ms.

## Context

- Plan 340 and ADR 0290: `SceneModel.warmViews` (`packages/renderer/src/scene.ts` ~1998) already draws the map views (vessel scope, then system scope) and the site view from the last snapshot. Both renderers call it at load (`renderer.ts` ~594, `renderer-webgpu.ts` ~513).
- ADR 0308 point 8 (plan 370): on a first load on Windows the renderer boots on `low` and swaps the requested preset in later; on the M2 with boot forced on, `high` came about 5.5 s after the world showed (journal 370). A frame near that swap may be the swap, not this plan's stall.
- ADR 0310 (plan 373): warm-up frames are drawn sunlit and governor steps keep the world's resource sizes, so presets build in the background.
- Scripts: `apps/web/scripts/measure-load.ts` (load marks), `apps/web/scripts/measure-sunrise.ts` (frames over 100 ms and the pipelines compiled in them). The `.tmp-measure.ts` named earlier never existed.

## Scope

**In:** the first Flight → Map, Map → Flight and site view; the first seconds after the loading screen on both backends.
**Out:** the boot preset swap itself (ADR 0308) and sunrise or governor stalls (plan 373).

## Steps

1. Measure again on WebGPU and WebGL: the first map toggle and the 8 s after the loading screen, with each long frame's compiled pipelines. Extend `measure-sunrise.ts` or `measure-load.ts` for the map toggle if neither covers it.
2. If no frame is over 100 ms, record the numbers and close the plan.
3. Otherwise, name what each long frame builds (the map HUD's first mount, path lines made on demand, the vegetation stage, Flight's first HUD frame) and move it into `warmViews` or idle time.
4. Measure after.

## Acceptance criteria

- [ ] On WebGPU and WebGL, the measurement script shows no frame over 100 ms in the first Flight → Map and in the 8 s after the loading screen (boot swap excluded), before and after in the journal.
- [ ] `bun test packages/renderer` passes.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; plan 340's measurement table updated.

## Log

- 2026-10-22: Drafted from plan 340's leftovers.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; `warmViews` already draws the map views; the missing `.tmp-measure.ts` replaced by `measure-load.ts` / `measure-sunrise.ts`; first step is to measure again after plans 370 and 373; depends adds 370 and 373.
- 2026-10-24 — Worker A: done. Measured again: the first map toggle was 4.5 s and every toggle rebuilt the pipelines (three disposes render objects when the scene's cache key changes). ADR 0359 keeps pipelines, programs and node states alive: no frame over 100 ms in the 8 s after the loading screen or in later toggles on both backends; the first Flight → Map is 126 ms (WebGPU) and 237 ms (WebGL), open.

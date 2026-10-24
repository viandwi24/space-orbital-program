---
id: 408
title: "No periodic stutter, renderer side: preset warming that never blocks play, governor steps without reallocation, honest HUD, TAAU per page, pacing above 144 Hz, a cheap autosave thumbnail"
status: ready
owner: "Worker A"
depends: []
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 408 — No periodic stutter, renderer side

**Size:** L

## Goal

Remove every recurring long frame (> 2 frame intervals) the renderer causes during play, on Windows and on the M2 as well as the M5. The owner sees 140–180 fps with a freeze every few seconds, and at the Space Center a sudden blurry ground while the HUD still reads "medium 100%".

## Context

- The owner's report and screenshots are in `refs/graphics-v2/reference/owner-spikes/`. The investigation, with file:line references, is in `refs/graphics-v2/06-periodic-spikes.md`, and ADR 0330 sets the targets.
- **Suspect 1: background preset warming.**
  - It runs for minutes after load (`packages/renderer/src/renderer-webgpu.ts` ~629-773).
  - Each round waits on `requestIdleCallback` with a 2 s timeout (`:464-469`). At an uncapped 180 fps there is no idle time, so every round is forced in.
  - Each round calls `applyPreset` twice, which reallocates every render target (`:645`, `:651`, then `applySize` `:237-245`), and draws whole frames.
- **Blurry ground.**
  - The HUD shows the requested preset, not the drawn one (`:914` against `presetDrawn` `:858`), and never shows TAAU.
  - Medium relies on TAAU at 0.5 (`presets.ts:171`).
  - The flight governor sets TAAU to 0 on a drop to low (`apps/web/src/lib/flight-loop.ts:1627`). `acquire` resets only the render scale (`world-renderer.svelte.ts:376-377`), so the TAAU-off state leaks into the Space Center.
- **Pacing.** `DISPLAY_RATES` stops at 144 (`quality-governor.ts:122`). On a 165 or 180 Hz screen, flight draws every second rAF, which gives about 82–90 fps (`:382-387`, `:522-536`).
- **Governor steps.** A step reallocates the render targets. A TAAU setting not seen before builds a new post chain during play (`renderer-webgpu.ts:188-235`; `flight-loop.ts:1618-1650`).
- **Autosave every 60 s.** It draws an extra full frame, does a synchronous canvas readback, and JPEG-encodes on the main thread (`flight-loop.ts:2370-2372`, `apps/web/src/lib/save/thumbnail.ts:28-38`).
- **Flight-only rebakes.**
  - Terrain patch: every ~717 m (`terrain-patch.ts:13/17`, `tsl/terrain.ts:200-206`).
  - Cloud map: at most every 2 s (`weather.ts:51-62`, `tsl/clouds.ts:275-283`).
  - Rocks: every 6 m below 150 m, plus a full clear at 60k cells (`ground-rocks.ts:28/132`).

## Scope

**In:**
- **Warming.**
  - Warm in small slices that fit spare time inside a frame, or only while the frame cap leaves headroom.
  - Never reallocate the live render targets: warm against off-screen targets of the right format.
  - Stop warming during flight input and warp changes.
  - No round may produce a frame over 2× the frame interval.
- **Governor and TAAU.**
  - Governor steps reuse the targets.
  - Pre-build the post chains for every TAAU scale the governor can reach, at load (ADR 0310).
  - Reset TAAU state per page in `acquire`.
- **HUD.** It shows the drawn preset, the render scale and the TAAU state.
- **Pacing.** `DISPLAY_RATES` covers 165, 170, 175, 180, 200 and 240 Hz. Pacing on those screens is even.
- **Autosave thumbnail.**
  - Make it cheaper: a small off-screen target read back asynchronously (`mapAsync` on WebGPU), encoded in a worker or with `OffscreenCanvas.convertToBlob`.
  - No extra frame on the main canvas.
- **Rebakes.** Amortise the terrain patch, the cloud map and the rock cells across frames (time-sliced), and replace the rocks' full cache clear with LRU eviction.

**Out:**
- The CPU and GC churn on the page side (plan 409).

## Touches

`packages/renderer/src/{renderer-webgpu,quality-governor,presets,terrain-patch,weather,ground-rocks}.ts`, `packages/renderer/src/tsl/{terrain,clouds}.ts`, `apps/web/src/lib/{flight-loop.ts,world-renderer.svelte.ts}`, `apps/web/src/lib/save/thumbnail.ts`, `apps/web/src/lib/perf/*`.

## Steps

1. **Add a "long frames" recorder** that also runs outside the Debug Info tab: a ring buffer of frames over 2× the interval, each tagged with a cause (warm round, governor step, autosave, rebake, GC gap). Unit-test the tagger.
2. **Fix each source above, with a unit test where the logic allows:**
   - warming never calls `applySize` on the live targets;
   - governor steps don't allocate;
   - TAAU state resets per page;
   - the display rate table covers the high-refresh screens;
   - rebake slices stay under their time budget.
3. **Measure on the M5** under `/tmp/orbital-measuring`. Run 2 minutes at the pad and 2 minutes in the Space Center, uncapped and at 120. Report the long frames per minute before and after. Record the M2 and Windows numbers as `[manual]` with a script the owner can run.

## Acceptance criteria

- [ ] **M5 at 120 Hz:** no frame over 2× the interval in 2 minutes at the pad and in the Space Center, outside the first 10 s after load.
- [ ] **M2 and Windows** (`[manual]`, owner): no visible periodic stutter at the default preset.
- [ ] **HUD:** shows the drawn preset, the scale and TAAU. The Space Center no longer goes blurry after a flight.
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with the before/after long-frame counts.
- [ ] ADR (warming and pacing rules; amends ADR 0310 and 0338).

## Log

- 2026-10-24 — Created by the coordinator from the owner's stutter report and `refs/graphics-v2/06-periodic-spikes.md`. Highest priority for Worker A.

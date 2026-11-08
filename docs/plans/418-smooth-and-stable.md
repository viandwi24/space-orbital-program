---
id: 418
title: "Smooth and stable: no allocation churn or GC pauses in play, no background stalls, a pad that holds 120 Hz on the M5 and 60 on Low elsewhere"
status: in-progress
owner: "Worker C"
depends: []
phase: 9
created: 2026-11-08
updated: 2026-11-08
---

# 418 — Smooth and stable

**Size:** L

## Goal

On 2026-11-08 the owner said the game is still not smooth, often lags and is unstable on the M5. ADR 0375 places the cause in our own code: memory churn, background work and the pad's launch site, not the engine. Remove the stutter sources and finish plan 414's target. This plan absorbs 414's open items.

## Context

- ADR 0375. ADR 0330 targets.
- `refs/graphics-v2/06-periodic-spikes.md` ranks nine suspects. Check which ones plans 408 (stalls) and 409 (GC) already fixed, and fix the rest.
- `refs/graphics-v2/07-look-costs.md`: the site is about 6 ms at the pad, and about 3.5 ms of that is unexplained.
- The handover `docs/roadmap/handover-2026-10-25.md`: the vessel batch re-merge (fixed in `03921954`). Still open there: the mesh terrain's distance image is sized from the old input size on the frame of a TAAU rung change.
- `perf:gate` (plan 411): its budgets are targets, not frozen from a measurement.

## Scope

**In:**
1. **Stability gate.**
   - `perf:gate` gains a soak mode, about 3 minutes per scene: pad, orbit, Space Center and a flight ascent.
   - The soak reports heap growth, the allocation rate in MB/s, major-GC count and long frames per minute (frames over 2× the interval).
   - Add budgets for these, with a unit test of the comparison.
2. **Allocation audit.** Find and remove per-frame allocations in the renderer, the flight loop, sim-client decoding and the pages:
   - `new` objects in hot paths;
   - `JSON.stringify` diffs;
   - `slice`/`map`/`filter` on per-frame paths.

   Use DevTools allocation sampling in headed Chromium, or `performance.measureUserAgentSpecificMemory`. Each fix is small and tested where it can be.
3. **Background stalls.** Confirm or fix each of the following so that no single task runs over 8 ms in play:
   - warming rounds;
   - autosave (frame readback and JPEG);
   - terrain patch rebakes;
   - cloud map rebakes;
   - rock rebuilds.

   Where work is long, spread it over frames or move it to a worker.
4. **The TAAU rung-change distance-image size bug** (handover).
5. **The pad's launch site.**
   - Explain the unexplained ~3.5 ms: take a Chrome trace and, where possible, an Xcode Metal capture.
   - Then fix it. Options: one `BundleGroup` for the static site; baked or unlit lighting for distant site parts; less overdraw from glow cones and pools.
   - Target from plan 414: a pad mean of 8.3 ms or less on the M5 at High, with at most 5 % of frames over 8.4 ms.
6. **Low on a Retina display.**
   - Low caps the pixel ratio at 1 today, which looks blurry on the M5.
   - Evaluate TAAU at Low from the display ratio with input 0.5. Turn it on only if the cost at the pad and in orbit is ≤ the current Low, measured interleaved.
7. **Freeze the perf:gate budgets** from a headed M5 run, using `--freeze`. Do this at the end of the plan, on a quiet machine with no other worker building.

**Out:** the looks of plans 416 and 417; an engine change (ADR 0375); WebGPU raw passes (only if this plan's trace shows a pass that TSL cannot fix: then write the plan, do not start it).

## Steps

1. (DONE) Read 06 and 07 and plans 408, 409, 414 and 415. Write the current state of each suspect into the journal.
2. (DONE) Soak gate and budgets (budget values are placeholders until step 7).
3. (DONE) Allocation audit and fixes.
4. (DONE) Background stalls, and the rung-change bug.
5. (DONE in part: the cost is one merged building-list mesh, 2.1 to 2.7 ms: its weather patch 1.8, lighting 1, shadow lookups 0.2 to 0.3; the exact fix gives -0.25 ms; the rest needs a look decision) Pad site: trace, then fix.
6. (DONE) Low TAAU evaluation: not turned on.
7. (DONE in part: plan 414 folded; budgets not frozen, the load average was above 3 and the soak does not yet meet the placeholders) Freeze the budgets. Mark plan 414 done or folded.

## Acceptance criteria

- [x] `perf:gate --soak` exists and reports heap growth, allocation rate, major GCs and long frames per minute. A unit test covers the budget comparison.
- [x] On the M5 at Low and High, in a 3-minute pad and orbit soak: no long frame from background work, and the allocation rate is lower than before (numbers in the journal). Met: allocation 97 to 62 MB/s (High pad), 85 to 68 (High orbit), 127 to 62 (Low pad), 114 to 61 (Low orbit); tasks over 8 ms are 0 to 1.3 a minute, only the frame function and one major GC, no warming, autosave, rebake or rock task.
- [ ] NOT MET: pad at High is 16.4 ms mean (GPU-bound), Low and Medium hold 8.33 ms. The trace says why: the main thread is 80 % idle; one merged building-list mesh costs 2.1 to 2.7 ms (weather patch 1.8); an exact branch fix took 0.25 ms; the rest is a look decision for the owner (journal). Pad on the M5 at High has a mean of 8.3 ms or less with at most 5 % of frames over 8.4 ms. If that is not met, the trace says why and the next step is written.
- [ ] NOT MET: not frozen (load average 2.4 to 4.4, above 3; soak about 60 MB/s against the 20 placeholder). Budgets frozen from a headed M5 run.
- [x] Dusk probe: 0 pipelines. Texture gate passes.
- [x] `bun test` for the affected packages, `bun run typecheck`, `bun run lint`, `bun run docs:check`.
- [ ] [manual] A locked 60 on the M2 and Windows at Low (`bun run perf:gate --quick`).

## Docs checklist

- [x] STATUS row, journal `docs/journal/418-smooth-and-stable.md`, plan 414 closed, worker brief soak rule, `refs/graphics-v2/06` suspect table updated.

## Log

- 2026-11-08 — Created by the coordinator from the owner's M5 test ("not smooth, often lags, unstable"). Absorbs plan 414's open items.
- 2026-11-08 — Worker C: steps 1 to 4 and 6 done, 5 and 7 in part (see the journal). Plan 414 folded into this plan. A follow-up plan is needed for the building-list mesh (try castShadow/receiveShadow on that one mesh, then a Metal capture) and for the budget freeze on a quiet machine.
- 2026-11-08 — Worker C, second pass (owner approved step 5): list mesh [1] is the `painted` mesh; weather twin 1.8 ms, lighting 1, shadow flags 0 to 0.3. `tsl/twins.ts` weather: streak and grime noise evaluated only where they are non-zero (identical image, -0.25 ms at the pad, screenshots inside run-to-run noise). Further cuts change the look: owner's call.
- 2026-11-08 — Worker C, third pass: weather fine octaves (grain, 0.9 m mottle, streak modulation, roughness noise) fade with view depth 30 to 60 m in the GLSL patch and the TSL twin, skipped beyond; look unchanged (shots inside run-to-run noise). Pad at High A/B: -0.15 ms, the -1 ms target is NOT met; the cost is not in the fine octaves. Budgets still not frozen.

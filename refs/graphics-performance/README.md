# Graphics performance — why `high` is heavy, how others stay smooth, and what it costs to fix

Research set written 2026-10-19 by Agent 2 at the owner's request: "graphics come second only to gameplay, because they decide whether the game is playable at all". The problem it starts from: the `high` preset feels heavy on the owner's MacBook Pro M5, although native games and some web games run smoothly on it.

Research only, no code. The set combines:
- an audit of our renderer (`packages/renderer`, read-only);
- measurements taken on the MacBook Pro M2 13" on 2026-10-18/19;
- a teardown of one web game (Teleoperator);
- web research, with sources checked on 2026-10-19.

Implications are tagged **Adopt / Improve / Avoid**. They are options for the owner and the Lead, not decisions; any of them becomes real only through an ADR and a plan.

## The answer in one page

1. **`high` is heavy at Retina because of the pixel count.** Every budget in this repo was set at 1920×1080 with pixel ratio 1 (2.07 Mpx). `high` caps the pixel ratio at 2, so a 14" MacBook Pro draws about 5.7–5.9 Mpx, roughly 2.8× as many pixels. Almost the whole frame is fullscreen per-pixel work: one planet pass marches the sky, clouds, light shafts and terrain, and evaluates hashed value noise. On the M2 the frame time grows almost exactly with pixels: 1 : 2.1 : 3.6 for 1 : 2.25 : 4 pixels ([02](02-measurements.md)). The M5 estimate is 30–40 ms at Retina `high`, against about 14 ms at 1080p.
2. **The governor then makes it feel worse.** It sees only the frame interval. At Retina it falls to the half-resolution rung, then retries a step up every 20 / 40 / 80 / 160 s. Each failed retry is about 3 s of 30–40 ms frames, a repeating stutter ([01](01-diagnosis.md) §4).
3. **Smooth web games pay once, not every frame.** Teleoperator, a three.js r186 game like ours, gets its look from baked light maps and AO, a sky computed into a texture, merged and instanced geometry, GPU-animated crowds and a 1.75 pixel-ratio cap ([03](03-how-others-do-it.md)). Planet games cannot bake light for one place, but the same principle applies to us: make the sky and clouds independent of resolution (LUTs, temporal amortisation) and spend pixels where the eye looks.
4. **The fix is mostly not a rewrite.**
   - **Phase 1** (quick wins, about 6–8 agent hours): a pixel budget instead of pixel ratio 2, the baked cloud-shadow map on `high`, lighter MSAA and bandwidth at Retina, and a pixel-ratio-aware governor with Valve-style rules. Expected: Retina `high` back near its 1080p cost, without visible change.
   - **Phases 2–4** (about 13–20 hours): a Hillaire sky with LUTs, a 3D noise texture, temporal clouds. They make an "ultra" preset affordable.
   - **WebGPU** (40–80 hours): not recommended before the release ([05](05-webgpu.md)).

   Cost and order are in [06](06-plan-and-cost.md).

## Index

| # | Document | What it answers |
|---|---|---|
| 00 | [Sources](00-sources.md) | Every external source, its date and reliability |
| 01 | [Diagnosis](01-diagnosis.md) | Our frame, pass by pass: what runs per pixel per frame, what is baked, the governor, recorded costs |
| 02 | [Measurements](02-measurements.md) | Frame time against pixel ratio on the M2 (2026-10-18/19), the method, the caveats, the M5 estimate |
| 03 | [How others do it](03-how-others-do-it.md) | Teleoperator teardown, the GTA V browser port, takram clouds, Elite Dangerous, Outerra, KSP2, Google Earth |
| 04 | [Techniques](04-techniques.md) | Resolution and upscaling, the sky, clouds, noise, bandwidth on Apple GPUs, depth, shadows, frame pacing and the governor, each tagged for us |
| 05 | [WebGPU](05-webgpu.md) | Browser status in October 2026, three.js WebGPURenderer and TSL, what moving would cost, recommendation |
| 06 | [Plan and cost](06-plan-and-cost.md) | Phases, sizes, agent hours, wall-clock, expected gains, acceptance numbers, risks |
| 07 | [The M5 baseline](07-m5-baseline.md) | Plan 251's measurements on the M5 (frame time by pixel ratio, the ablation, the governor trace) and what plan 252 changed |

## Raw data and the tool

- `data/m2-run1-retina.json`: `medium` and `high` at pixel ratios 1, 1.5 and 2 on a 1512 × 945 viewport at scale factor 2, plus the half planet pass and render scale 0.67 rungs at ratio 2.
- `data/m2-run2-retina-high-descending.json`: `high` again, ratios in the opposite order with an 8 s settle.
- `data/m2-run3-1080p-control.json`: a 1080p control run that disagreed with journal 066; see the caveats in [02](02-measurements.md).
- `data/m5-run1…5-*.json`: the M5 runs of 2026-10-20 (plans 251 and 252), made with `apps/web/scripts/measure-graphics.ts`, which folds in `measure-dpr.ts` and adds the ablation, the trace and the power notes.
- `tools/measure-dpr.ts`: the script that produced them, with options for the viewport, scale factor, presets and ratios, and how to run it. The baseline still needed is this run on the M5 ([02](02-measurements.md), "Needed next").

## Glossary

| Term | Meaning |
|---|---|
| Pixel ratio (DPR) | Device pixels per CSS pixel; 2 on Retina. `high` uses `min(DPR, 2)`. |
| Mpx | Million pixels drawn per frame. 1080p = 2.07, 14" Retina at ratio 2 = 5.9. |
| Planet pass | Our one fullscreen shader that draws sky, terrain, sea, clouds, shafts, aurora and stars (`shaders/planet.glsl.ts`). |
| Half rung | The governor level that draws the planet pass at half size and upsamples it (ADR 0064), with an edge pass (ADR 0087). |
| LUT | Look-up table: a small texture computed once (or rarely) and read many times. |
| Hillaire sky | The 2020 atmosphere method with transmittance, multi-scattering, sky-view and aerial-perspective LUTs; its cost does not grow with resolution. |
| Temporal amortisation | Computing an expensive effect for a fraction of the pixels each frame and reusing earlier frames (reprojection) for the rest. |
| TBDR | Tile-based deferred rendering, the Apple GPU design: MSAA is cheap in tile memory, bandwidth to memory is expensive. |
| sync ms | Our benchmark number: the minimum over windows of `renderer.debug.benchmark(1)` (journal 054 method). |

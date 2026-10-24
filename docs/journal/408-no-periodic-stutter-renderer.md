# 408 — No periodic stutter, renderer side

**Plan:** [plans/408-no-periodic-stutter-renderer.md](../plans/408-no-periodic-stutter-renderer.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0367](../decisions/0367-no-periodic-stutter.md)

## What was done

The eight changes of the ADR, each with a unit test where the logic allows: the loading screen waits for the presets (`world-renderer.svelte.ts`), `acquire` resets TAAU, scales and the governed preset, `Renderer.presetDrawn` and TAAU in the perf line (`perf-stats.ts`), the display-rate table and a test per rate above 144 Hz, the thumbnail of the next drawn frame (`save/thumbnail.ts`, `flight-loop.ts`), the cloud cadence (`weather.ts`) and the rocks' eviction (`ground-rocks.ts`), the long-frame log (`perf/long-frames.ts`, in `PerfSource`), and `autoLimitFor` (Automatic stops at `medium` on a 60 Hz device that starts on `low`). The earlier fixes of the same hunt, found while measuring governor steps: ADR 0359 (the TAAU key, the plume light pool, pipelines kept alive).

## Numbers (M5, Chrome, 120 Hz, `high`, WebGPU, 60 s after 10 s of settling; `scripts/measure-long-frames.ts`)

The M5 at the pad shows none of the owner's stalls in either build, so the before and after are close; the changes are for the slower machines.

| | before | after |
|---|---|---|
| flight, governor off | p50 24.5 ms (GPU-bound at `high`), 1 frame of 85 to 96 ms a minute | p50 24.6 ms, 3 to 4 frames of 73 to 92 ms a minute (marked: governor, GC) |
| flight, Automatic | one run 37 frames a minute with a 675 ms step | runs of 14 and 355 a minute (the governor falls to `low` at the pad on a loaded machine, and each step is a long frame), worst 151 ms |
| Space Center | p50 15.0 ms, 0 long | p50 15.7 ms, 7 long (32 to 34 ms) |

A governed step to `medium` before ADR 0359 was 600 to 800 ms and is 16 ms (`profile-governor-step.ts`). The runs are noisy (another worker's measuring ran on the machine; load 3 to 12). Open: the extra 70 to 90 ms frames a minute in the flight run (unmarked, probably the first-snapshot thumbnail or the HUD); the M2 and Windows numbers are `[manual]`: `bun scripts/measure-long-frames.ts` on those machines, `AUTO=off` and the default.

## Findings

- The Space Center at `high` is GPU-bound at 15 ms on the M5 at Retina (64 fps): a finding for plan 410 (what the site view draws that flight does not).
- The M5's default `high` flight is also 24.5 ms at the pad with the governor off: the 120 lock needs the governor and TAAU, as ADR 0338 says.
- Measuring: a run that ends its turn with a background job loses the job; a `pkill -f` whose pattern is in the launching command kills its own shell. The scripts take PIDs now.

## Not done

Time-sliced terrain patches; the owner's check of the pad for flicker with TAAU on (the flashing the owner saw was plan 369's casters A/B).

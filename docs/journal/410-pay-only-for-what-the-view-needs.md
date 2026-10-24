# 410 — Pay only for what the view needs

**Plan:** [plans/410-pay-only-for-what-the-view-needs.md](../plans/410-pay-only-for-what-the-view-needs.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0369](../decisions/0369-relevance-gates.md)

## What was done

`relevance.ts` and its table test; three run-time gates in the planet pass (`uGateOcean`, `uGateClouds`, `uGateTerrain`, set by `Environment` from the levels), `debug.setLookOff` for them and `debug.lookCosts`; `device-limits.ts` (more sampled textures per stage where the adapter has them); `scripts/check-console.ts` (the console errors of a flight page's first seconds); the compile-in-play count in `measure-long-frames.ts`. Worker C wrote the Debug rows; Worker B's `measure-looks.ts` is the harness.

## Cost table (M5, Chrome, `high`, WebGPU, 120 Hz, a booster; `measure-looks.ts`, 2 rounds of 10 s, on and off alternating)

GPU ms (the timestamps under-read on Apple GPUs, so only differences matter); the frame intervals of the near-ground scenes were noisy (p95 17 to 216 ms) because other work ran on the machine, so only the repeated differences are listed.

| scene | clouds on / off | terrain march on / off | sea on / off |
|---|---|---|---|
| pad | 5.7 / 8.0 (noise) | 8.7 / 6.1 | 5.5 / 5.5 |
| 3 km | 9.5 / 5.3 | 6.1 / 10.1 (noise) | 5.5 / 7.3 (noise) |
| 12 km | 8.9 / 7.0 | 7.2 / 4.7 | 11.8 / 7.3 (noise) |
| orbit | 2.4 / 2.3 | 2.4 / 2.2 | 2.6 / 2.5 |
| Space Center | 1.5 / 1.5 | 1.6 / 1.6 | 1.5 / 1.5 |

Near the ground the clouds cost 2 to 4 ms and the terrain march about 2.5 ms; the sea is within noise. In orbit and in the Space Center none of the three costs anything measurable: the acceptance of "about 0 ms" holds, and had held before this plan (the footprint tests inside the shader). The 12 km scene's vessel falls and is destroyed after a minute, and the orbit scene of `measure-looks.ts` therefore needs its own page (run `SCENES=orbit,space-center` apart).

## Findings

- **A pipeline that fails to build is silent.** With the sample planet mod installed, a planet shadow pipeline needed 17 sampled textures against the default 16, failed, and took the sea's edge pass and some materials with it (`Async render pipeline creation failed` in the console): the first run of the table printed it. Fixed by asking for up to 32 (ADR 0369 point 5); `check-console.ts` prints such failures.
- **Compiles in play: 0** (`measure-long-frames.ts`, flight at the pad, 60 s, governor off and on, after the loading screen). With Automatic on the M5 settled on `medium` with TAAU at 0.5, p50 8.3 ms, p95 10.3 ms, the longest frame 18 ms, three frames over 17 ms a minute.
- The Space Center at `high` is GPU-bound on this M5 (about 15 ms a frame in earlier runs).

## Not done

M2 and Windows numbers [manual]: `bun scripts/measure-long-frames.ts` and `measure-looks.ts` on those machines. Plume, rocks and plasma gates (their plans). The look levels of Debug show a measured ms only where a pass is timed (0 elsewhere).

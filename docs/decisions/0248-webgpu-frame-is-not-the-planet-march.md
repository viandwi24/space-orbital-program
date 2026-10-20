# 0248 — On WebGPU the frame is bound by its full-size pixels, not the planet march: Phases 6–8 wait for numbers

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/261-webgpu-renderer-migration.md (Phases 6, 7 and 8)
**Builds on:** ADR 0249 (the WebGPU renderer), ADR 0233 (the governor), ADR 0234 (the planet pass's pixel budget)

## Context

Plan 261 planned three ways to spend less on the planet pass, and one way to spend the savings:

- Phase 6: an aerial-perspective volume read by clouds and terrain, in place of the per-pixel march.
- Phase 7: noise textures and temporal clouds.
- Phase 8, step 27: an `ultra` preset to spend what those save.

All of them assume the planet march is what holds the frame back. With Phases 1–5 done, the M2 at Retina (2560 × 1600, `high`, governor off) was measured with the feature switches (plan 251) and with timestamp queries:

| | pad | low sun | 12 km |
|---|---|---|---|
| GPU time, timestamp queries | 11.0 ms | 17.7 ms | 19.1 ms |
| saved by the clouds at `medium`'s settings | 0.8 | 0.8 | ≈ 0 |
| saved by the shafts | 0.0 | ≈ 0 | 0.2 |
| saved by the terrain at `medium`'s settings | 0.4 | 1.4 | 0.5 |
| saved by the aurora at `medium`'s settings | 0.3 | 0.9 | 2.7 |
| frame interval | 31.5 ms | 33 ms | 33 ms |

The noise between runs is about ±1 ms (±5 ms where a switch reloads the vegetation). A CPU profile of the pad shows the main thread idle 75 % of the time and about 3 ms of JavaScript a frame.

Lowering only the render scale, at the pad:

| render scale | 1 | 0.85 | 0.7 | 0.5 |
|---|---|---|---|---|
| frame interval | 33.2 ms | 16.7 | 16.7 | 16.7 |

So the frame misses 60 fps at full size although the queries add up to 11 ms. The time it lacks scales with the full-size pixels, and timestamp queries do not see it: the end of the frame (resolving and presenting a 2560 × 1600 target on a tile GPU). The planet march (the clouds, shafts and terrain in it) is a few milliseconds of the measured part.

## Decision

1. **Phases 6 step 22 and 7 wait.** The aerial-perspective volume and temporal clouds would save at most the clouds' and the air's few milliseconds of measured GPU time. They would not bring full size to 60 fps on the M2. They also bring their own risks: history artefacts, the fallback's lack of 3D render targets. They come back when a measurement shows the planet march holding a frame back, for example on a machine where the frame interval follows the timestamps.
2. **No `ultra` preset yet** (Phase 8 step 27). On the M2 the WebGPU path holds 60 fps at 0.85 of full size and not above, so there is no spare time to spend. Measuring headroom on the M5 needs the machine, and the owner skipped the M5 for this plan.
3. **The governor uses GPU time as evidence, with the bans in force** (Phase 8 step 26, done). WebGPU's timestamp queries reach `QualityGovernor.tick`. A rung that failed in a scene stays banned whatever the work time says, since the queries under-report on Apple GPUs. Without the ban, an under-reporting work time would retry the failed rung after every gap.
4. **Phase 6 step 21 (evaluate `pmndrs/sky`) is not done.** The owner's rule for this work keeps it inside this repository. The LUT sky of Phase 6 step 20 is our own port of Hillaire's tables, so nothing waits on an outside library.

## Consequences

- The WebGPU path's gain stands as measured in Phase 2: at Retina it draws `high` at 30 fps at full size where WebGL drew 7 to 10, and at 60 fps from 0.85 down. The governor finds that rung by itself.
- The next performance work on WebGPU is the frame's end at full size: MSAA samples and the post chain's target format at Retina. Its measure is the frame interval, not timestamp queries.
- Plan 261's Phases 6 (steps 21 and 22), 7 and 8 (step 27) close as deferred, with this ADR as the reason.

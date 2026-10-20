# 251 — Graphics phase 0: measurement tools, feature switches, a frame-time histogram and the M5 Retina baseline

**Plan:** [plans/251-graphics-measure-baseline.md](../plans/251-graphics-measure-baseline.md) · **Session:** Worker A, 2026-10-20 · **Research:** [refs/graphics-performance/](../../refs/graphics-performance/README.md), [07-m5-baseline.md](../../refs/graphics-performance/07-m5-baseline.md)

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/feature-switches.ts` | eight switches (shadowMap, cloudShadow, shafts, clouds, terrain, aurora, tufts, msaa) that take one `high` extra down to `medium`'s value; `renderer.debug.setFeature / features / resetFeatures`; turning one off puts the exact values back, in any order |
| `apps/web/src/lib/flight-loop.ts` | the dev-only startup hook (`orbital.graphics.features`) that applies switches before the programs compile; a `FrameHistogram` fed every frame; `__orbital.frameStats / resetFrameStats / level` |
| `apps/web/src/lib/debug/` | `frame-histogram.ts` (p50, p95, p99, the shares over 16.7 and 33.3 ms with 1 ms of timestamp jitter, the last two minutes) and its Reset in Debug → Info |
| `apps/web/scripts/measure-graphics.ts` | viewport, scale factor, presets, ratios, five scenes, the ablation on a fresh page per switch, a governor-on trace, power and thermal notes, a visibility check, rows re-measured when they read over 1.3 times their reference |
| `refs/graphics-performance/` | `07-m5-baseline.md` and the five runs in `data/` |
| tests | `feature-switches.test.ts`, `frame-histogram.test.ts` |

## What surprised me

- **A switch applied at run time lies for the ones that change a shader define.** `cloudShadow`, `shafts`, `clouds` and `terrain` read 2.5–3× *slower* than plain `high` (journal 050 warned: a program compiled after the page loaded reads 2–3× slow). The owner's click on the window looked like the cause at first; run 2 showed the same on a quiet machine. The ablation now opens a fresh page per switch with the switch set before `precompile`.
- **The M5 changed power state between runs.** Run 1 was on AC, run 2 on battery at 28 % and falling. The sync table survived it (it matches the AC rerun within 0.4 ms), but the governor trace did not: a flat 30 ms interval is the 30 fps cap of Chrome's Energy Saver near 20 % battery, and the governor, which sees only the interval, sank to `low`. Every run now records `pmset` in its JSON.
- **A steady 60 fps reads 16.6–16.8 ms.** With the exact 16.667 budget about half of the frames counted as late; the histogram and the trace allow 1 ms.
- **The M5 is a 120 Hz display.** A frame that just misses 16.7 ms takes the third vsync, 25 ms, so p95 jumps from 16.7 to 25.
- **The first guess of the plan was wrong for the M5:** `high` is only 1.37× `medium` at every ratio (the research measured 4× on the M2); the weight is the pixel count (cost 1 : 1.99 : 3.32 for 1 : 2.25 : 4 pixels), and no `high` extra is large alone (the biggest is `msaa`, 3 to 4 ms).
- **The hillside scene is not a stable scene:** 2.7 to 10.6 ms between rows of one configuration. It is kept in the JSON and out of the conclusions.

## Decisions made

- No ADR: tooling. The baseline's findings feed plan 252's ADR 0232 and plan 253.
- The canvas `antialias` flag is fixed at context creation, so it has no switch; `high` draws into its own multisampled target and the `msaa` switch covers it.
- There is no separate Performance tab in the Debug panel; the histogram is in Info, where the FPS already was.

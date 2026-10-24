# 342 — The first map toggle and the last frame hitch

**Plan:** [plans/342-first-map-toggle-and-post-load-hitch.md](../plans/342-first-map-toggle-and-post-load-hitch.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0359](../decisions/0359-keep-pipelines-alive.md)

## What was done

`scripts/measure-first-frames.ts` (the 8 s after the loading screen and four Flight ↔ Map toggles, the frames over 100 ms and the pipelines compiled in each; options `BACKENDS`, `AFTER`, `PRESET`, `NO_TAAU`). The first run found far more than plan 340's leftovers: every toggle rebuilt the planet pass and the materials. `keepPipelines` (ADR 0359) stopped three from releasing what a disposed render object held.

## Numbers (M5, Chrome, `medium`, longest frame / frames over 100 ms)

| | before (WebGPU) | after (WebGPU) | before (WebGL) | after (WebGL) |
|---|---|---|---|---|
| the 8 s after the loading screen | 417 ms / 4 | 21 ms / 0 | 44 ms / 0 | 90 ms / 0 |
| first Flight → Map | 4542 ms | 126 ms | 293 ms | 237 ms |
| Map → Flight | 1349 ms | 19 ms | 44 ms | 62 ms |
| second Flight → Map | 555 ms | 19 ms | 16 ms | 17 ms |
| second Map → Flight | 473 ms (and 151) | 82 ms | 600 ms | 20 ms |

## Not done

The first Flight → Map is still 126 ms (WebGPU) and 237 ms (WebGL): the map's own objects (twin lines, vessel markers, some mesh materials) compile on that frame, and the next frame is the map HUD's first mount. Moving them into `warmViews` needs the warm-up to draw the map with the vessel's objects present (open). The boot preset swap (ADR 0308) was not in these runs.

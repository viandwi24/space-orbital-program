# 397 — Clouds v2

**Plan:** [plans/397-clouds-v2.md](../plans/397-clouds-v2.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0342](../decisions/0342-clouds-v2-weather-first.md)

## What was done

| Where | What |
|---|---|
| `renderer/weather.ts`, `environment.ts`, `scene.ts` | the cover follows a weather from the terrain seed and game time; the cloud map re-bakes a step at a time |
| `renderer/tsl/planet-pass.ts` | the cloud march at half the steps with a per-frame offset under TAAU, full on a cut; squared step spacing inside the slab |
| `renderer/noise-volume.ts`, `tsl/clouds.ts` | the baked 128³ noise volume; the erosion reads it |
| `renderer/presets.ts`, `web/SettingsDialog.svelte` | the `clouds` look (low, medium, high) |
| `web/scripts/capture-clouds.ts` | before/after screenshots at four views |

## Tests

`weather.test.ts` (determinism, bounds, movement across days, continuity, step pacing), `noise-volume.test.ts` (tiling, determinism, channels, the midpoint rule, the TAAU step policy and the frame offsets covering the step), `look-levels.test.ts` (the clouds look follows the preset and a pin changes steps, octaves and detail), `graphics-profile.test.ts`.

## Screens

`docs/journal/assets/397-{before,after}-{under,inside,over,orbit}-{off,on,turn,after}.jpg` (1512 × 945 at DSF 2, `high`): over the clouds the shapes and shading match; after, the edges are a little softer. The under and inside views look at the ground (the camera is not tilted up), so they say little about the clouds.

## Numbers (M5, `m5-clouds-*.json`)

Medium p95 16.6 to 18.6 ms in both builds at 3 km and 12 km (one after run read 10.4 at 12 km), high 25 to 33 ms in both; the planet pass is 0.2 to 0.4 ms by the timestamps. Load 5 to 14 during the runs: no difference outside noise. Clouds do not hold the frame in these views.

## Not done

The separate cloud pass with a quarter of the pixels (ADR 0342 says why), a compute bake, a measurement where clouds fill the view, the owner's look check against reference look 6, `measure-sunrise.ts` with `STEP_TO`.

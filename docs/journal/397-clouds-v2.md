# 397 — Clouds v2

**Plan:** [plans/397-clouds-v2.md](../plans/397-clouds-v2.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0342](../decisions/0342-clouds-v2-weather-first.md)

## What was done (stage 1: weather)

| Where | What |
|---|---|
| `renderer/weather.ts` | `weatherCover(seed, t)` (deterministic, three octaves), `quantizeCover`, `stepCover` (a step per two seconds) |
| `renderer/environment.ts`, `scene.ts` | the cover follows the weather from the game time (`simTime`); the cloud map re-bakes only on a step |
| `renderer/test/weather.test.ts` | determinism per seed and time, bounds, movement over three days, continuity at ten minutes, step pacing |

## Findings

- The cloud map bake was already keyed by cover (`CloudMapTSL.update`), so weather needs no new pass; the pacing keeps a time warp from re-baking every frame.
- The planet pass composes the cloud march inline with the ground, so the temporal march needs the march in its own pass first (ADR 0342, stage 2).

## Not done

- Temporal march on TAAU's history, compute-baked 3D noise, volumetric clouds near the vessel, the quality switch.
- A look at the weather changing across a day under warp, and the cost of a bake step on the M5 [manual]; `measure-sunrise.ts` with `STEP_TO`; the screenshots and the owner's look check against reference look 6.

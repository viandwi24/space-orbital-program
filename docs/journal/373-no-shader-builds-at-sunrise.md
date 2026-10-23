# 373 — No shader builds at sunrise or on a governor step

**Plan:** [plans/373-no-shader-builds-at-sunrise.md](../plans/373-no-shader-builds-at-sunrise.md) · **ADR:** [0310](../decisions/0310-no-shader-builds-at-sunrise-or-governor-steps.md) · **Session:** perf / auto quality (Claude) · **Date:** 2026-10-23

## What was done

- `Environment.forceShadow`, and sunlit warm-up frames on both backends: on WebGPU the load's frame and views, the other planet scale, the boot swap and every warmed preset; on WebGL the views.
- `settingsFor(preset, resources)` and `Renderer.setPreset(preset, { governed })`. A governor step keeps the map width, the terrain cube and patch sizes, and the shadow map's side. On WebGPU it also keeps the vessels' part detail (`SceneModel.setPreset(…, keepParts)`). The flight loop's governor moves are governed; a player's preset choice is not.
- `warmPresetsFor` warms every preset the governor can reach up to the ceiling, nearest first. The background warm-up draws each preset's planet paths in rounds of their own, apart from its part models.
- `QualityGovernor.setHeld`: the flight loop holds the governor until the renderer's precompile resolves.
- `apps/web/scripts/measure-sunrise.ts`, from the parent session's probe. Options:
  - backend;
  - day or night start, by mean anomaly;
  - `STEP_TO`: governed preset steps during the run;
  - it prints the planet pipelines by load phase.

## Numbers (M2, 1440 × 900, the booster example in a 100 km orbit at 50×, 120 s ≈ 3 orbits, 3 sunrises)

Before is origin/main f2c3a1ce: plan 370's Windows follow-up, which already stopped a new shadow map from clearing the planet variants. After is this plan on top of it. Each run makes governed steps to high, medium and low at 30, 60 and 90 s.

| Run | frames over 100 ms, before | worst, before | over 100 ms, after | worst, after |
|---|---|---|---|---|
| WebGPU, day start | 4 | 1489 ms (step to high: terrain cube, scaled-space bake, prepass, half, edge) | 0 | 58 ms |
| WebGPU, night start | 4 | 1317 ms (half and edge of high) | 1 (round 7), 0 (round 8) | 593 ms (one `planet-edge` of high, round 7); 70 ms (round 8) |
| WebGL, day start, no forced steps | 0 (28 ms, plan-370 base not measured) | | 0 | 28 ms |
| WebGL, night start, no forced steps | 0 (34 ms, plan-370 base not measured) | | 2 | 147 ms (106 at the first sunrise, one program; 147 at the governor's step to low, six programs) |

Before plan 370's follow-up (origin cff8cd6b, no forced steps), the same probe read 601 ms at the first sunrise (the planet's upsample and edge, `ShadowMaterial`) and up to 2352 ms at governor steps.

## What surprised me

- The governor itself defeated the warm-up. It moved about 10 s after load, while the background was still warming the preset it moved to. The warm loop stops when the drawn preset changes, so the half path was built in flight. Holding the governor until the precompile resolves fixed it.
- The background warm never built another preset's half path while that preset's part models were drawn in the same frames: the parts used up the 50 ms build budget each round. Separate rounds fixed it.
- On WebGL, keeping the part detail or the map and terrain sizes on a step made programs the WebGL precompile never compiled (100–230 ms frames). WebGL takes the step's preset whole, as before; the resource rule is WebGPU's.
- A step to `high` grew the shadow map to 4096 a few frames later. The step now keeps the resource preset's side.

## Open

- WebGL's night start: 106 ms at the first sunrise (one program) and 147 ms at the governor's step to low (six programs). The earlier WebGL baseline (34 ms) was measured before plan 370's follow-up and without the governor reaching low, so it is not a like-for-like before.

- One 593 ms `planet-edge` build of `high` at a governor step in the night run, although `high` was warmed in the background. Not explained yet. The probe's forced steps and the live governor both move the preset in these runs, so the path that reached it may not be one the warm-up drew.

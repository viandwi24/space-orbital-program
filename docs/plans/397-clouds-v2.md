---
id: 397
title: "Clouds v2: temporal cloud marching on TAAU's history, compute-baked 3D noise, a weather coverage map that changes over time, volumetric clouds near the vessel"
status: draft
owner: "Worker A"
depends: [393, 395]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 397 — Clouds v2

## Goal

Clouds look like weather and cost less. The cloud march runs temporally, a fraction of the pixels per frame on TAAU's jitter and history; noise comes from 3D textures baked by compute; cover comes from a weather map that changes over time instead of a constant; and the vessel can fly through volumetric clouds up close. This delivers reference look 6 (volumetric weather).

## Context

- Read: `refs/graphics-v2/02-browser-120fps.md` §3 (clouds: 1/16 temporal march, takram 92–95 fps against 31 [B19]; HZD half resolution and 4×4 [B21]; Cinevva 128³ Perlin-Worley and 32³ Worley baked by compute, 1.1–2.0 ms on an M1 [B22]; noise in textures) and §5 items 5–6. `refs/graphics-v2/03-renderer-and-mod-audit.md` A2 (cumulus slab 3/4/6 steps, octaves 3/3/4, billow 1/2/3; cloud map baked when the cover changes) and A6 "Clouds" (a 1,100 m slab above 3,500 m over a 2D coverage field; cirrus at 9.5 km, `packages/renderer/src/cloud-model.ts:17`; cover a constant 0.42, `packages/renderer/src/environment.ts:158`; no temporal reprojection; no weather). `refs/graphics-v2/01-ksp-and-mods.md` (EVE and blackrack's clouds).
- Code: `packages/renderer/src/tsl/clouds.ts`, `tsl/noise.ts`, `tsl/planet-pass.ts`, `cloud-model.ts`, `environment.ts`.
- Builds on 393 (TAAU jitter and history, cut detection) and 395 (the governor's budget and axes).
- ADRs: 0248 (held temporal clouds until a measurement showed clouds holding the frame), 0310 (warm at load), 0330 (looks built in; a quality setting and a switch per look; mods later supply cloud and weather maps via 405).

## Scope

**In:**
- **ADR in step 1:** the cloud model v2 (slab vs volume, march fraction, noise sizes, weather map format, history rules).
- Temporal cloud march sharing TAAU's jitter and history: 1/16 or ¼ of pixels per frame, a full march on cut frames.
- Compute-baked 3D noise: 128³ base and 32³ detail, used by the clouds and the cloud shadows; a render-pass bake for the WebGL2 fallback.
- A weather coverage map that evolves over time (types, cover, drift), replacing the constant cover; the cloud-shadow map follows it.
- Volumetric clouds near the vessel: the march works inside the slab, with more steps near the camera.
- History clamping against halos and smearing (neighbourhood clamp, depth-aware rejection).
- A quality level and a switch for clouds (consumed by 404's settings).

**Out:**
- Mod cloud and weather maps (405); a 2D cloud cube for orbit (403); weather in the sim (wind, rain on parts).
- e2e tests (paused by the owner).

## Design notes

- The weather map is deterministic from the world seed and game time, so a save reloads the same sky; it is renderer data, not sim state.
- The noise bake runs at load inside the load contract (ADR 0308/0310), never in a frame.
- Thin features (cloud edges against the vessel) are where history smears; test with a fast roll and a camera cut.

## Steps

1. ADR for clouds v2.
2. Compute-baked 3D noise; the clouds and cloud shadows read it.
3. Temporal march on TAAU's jitter and history; full march on cuts; history clamping.
4. The evolving weather coverage map and its shadow map.
5. Volumetric clouds near the vessel.
6. Quality levels and the switch; warm the pipelines.
7. Measure with 392's tooling; screenshots; the owner's look check.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including unit tests for the weather map (deterministic from seed and time; cover changes over a day), the march-fraction pixel pattern (every pixel refreshed within N frames), and the history reset on a cut.
- [ ] `measure-sunrise.ts` with `STEP_TO` shows no pipeline compiled on a governor step or a cut.
- [ ] Measured on the M5, WebGPU `high`: the cloud pass's GPU ms and the p95 frame interval at 3 km and 12 km, against 393/395 and the wave target p95 ≤ 8.4 ms; recorded in the journal. [manual: the M5 run]
- [ ] `capture-graphics.ts` and `capture-planet-sky.ts` screenshots, including flying through a cloud: no halo or smear on the vessel. [manual: the owner's look check against reference look 6]
- [ ] `bun run typecheck`, `bun run build` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/397-clouds-v2.md` written, with screens and numbers.
- [ ] `docs/architecture/` renderer doc: clouds and weather.
- [ ] ADR for clouds v2 (step 1), linked above.
- [ ] `docs/research/stack-versions.md` for anything looked up.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).

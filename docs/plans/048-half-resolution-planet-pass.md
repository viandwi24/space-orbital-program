---
id: 048
title: "Cheaper preset switches (the half-resolution planet pass moved to draft 050)"
status: in-progress
owner: "switch session (Claude, 2026-10-17)"
depends: [039]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 048 — Cheaper preset switches

(The file name keeps its first slug; the half-resolution planet pass is draft [050](050-half-resolution-planet-pass.md).)

## Goal

Switching the graphics preset, by the player or by the quality governor in the middle of a flight (ADR 0053), does not hitch: the longest frame in the 2 s after a switch is at most 4x the steady frame of the target preset.

## Context

- Plan 039 (criterion moved here by the orchestrator review), ADR 0053, journal 039 "Preset-switch hitch": the worst switch costs 130 to 290 ms, and it is not the shader compile. `SiteGroup.setTrees` (`LaunchSite.setTrees`) regenerates the instanced trees, bushes, rocks and grass tufts on every switch (48 to 207 ms); the first frame after a change of `terrainSize` or `terrainPatch` re-bakes the terrain cube map and both patches (40 to 130 ms). `PlanetPass.warmMaps` already moves the biome map (0.97 s) into idle periods; this plan does the same for the other two.
- Techniques checked on 2026-10-17 (recorded in `docs/research/three.md`): `InstancedMesh.count` can be lowered after construction but never raised past the constructor's capacity (https://threejs.org/docs/#api/en/objects/InstancedMesh); `requestIdleCallback` with a `timeout` for required work (https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback), already used by `precompile`.
- Why not "allocate at the maximum and change `count`": the layouts are not prefixes of each other. `layoutVegetation(count)` draws bushes and rocks from the same seeded generator after the trees, and `layoutTufts(count)` sizes its grid from the count, so the 900-tree site is not the first 900 trees of the 2000-tree one; a `count` cut would change the look of the lower presets. See ADR 0055.

## Scope

**In:**
1. **Vegetation kept per preset** (ADR 0055): the instanced set of each (trees, tufts) budget is built once, kept, and a switch swaps which set is in the scene (no build, no dispose). The sets of the other presets are built ahead, one mesh per idle period, by `Renderer.precompile`. A switch before a set is ready builds it in `setPreset` (the old behaviour) so nothing is missing.
2. **Terrain bake spread over frames** (ADR 0055): a change of `terrainSize` or `terrainPatch` keeps drawing with the baked textures it has (valid heights at the old resolution) while the new ones are baked one cube face, then one patch, per frame, and swaps when complete. Only a change of site (first frame, `setSite`) still bakes everything at once. The biome-map change no longer invalidates the terrain (the heights always read the canonical-width map).
3. A debug hook to measure the hitch (`debug.switchHitch`) is not added; the measurement harness lives in the journal's method section.

**Out (draft plans):** the half-resolution planet pass (draft 050); measurements on M1/M2, Intel and a phone-class GPU (draft 038 holds them); cloud shadows on `medium` (draft 050).

## Steps

1. Refine (this document, ADR 0055). Baseline hitch table in a production build (`NODE_ENV=development vite build`, served static; method of journal 039) and pad screenshots at each preset.
2. Vegetation per preset, with the idle warm-up from `precompile`; tests for the cache (swap does not rebuild, layout unchanged).
3. Progressive terrain bake; tests for the planning logic that can run without a GL context.
4. After table, pad screenshots, the governor-driven mid-flight switch, full suites, docs.

## Acceptance criteria

- [~] **Hitch, manual switch** (DONE in part: 26 of 28 switches within the bound, worst 37 ms against 25.6; before 47 to 350 ms; journal 048): in a production build on the Apple M5 (1920 x 1080, ratio 1, hidden built-in pane, a page loaded at least 20 s earlier so `precompile` has finished), for each of the six ordered switches between `low`, `medium` and `high`, `setPreset` plus the longest frame in the 2 s after it is at most 4x the steady frame time of the target preset (steady = minimum over 30 windows of 8 frames in the same page). Before and after tables in journal 048.
- [~] **Hitch, governor** (DONE in part: ladder steps run as `setPreset` + `setRenderScale`, 7 of 9 within the bound, worst 44.7 against 38.8; real frame loop not run): a switch made by `QualityGovernor` through the flight loop (`applyLevel`, trace-driven ladder step to the next preset) in the same page shows no frame above the same bound.
- [x] **No visual regression** (blurred difference 0.7 to 0.9 of 255, mean colour within 0.4, vegetation pinned by a test; the raw difference is dominated by time-animated detail, journal 048): pad screenshots (`pad-morning`) at each preset before and after, same camera, compared by mean absolute pixel difference (at most 1/255 on average outside noise) and by eye; the vegetation layouts are identical (a unit test pins the per-preset instance counts and first instance matrix).
- [x] The steady frame times at the pad do not rise by more than 0.3 ms on any preset.
- [x] `bun test packages/renderer`, `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check` pass.

## Docs checklist

- [x] STATUS, journal 048, ADR 0055, research (three.md), draft 050 with a board row.

## Log

- 2026-10-17 — Created as draft by the plan 039 completion session (the orchestrator review asked for the half-resolution pass as a post-v1 draft unless `medium` could not meet its target without it).
- 2026-10-17 — Orchestrator review of plan 039: the preset-switch hitch (130–290 ms; vegetation rebuild and terrain re-bake) is a v1 must-ship item here, because the quality governor can switch presets mid-flight. The half-resolution planet pass stays optional for v1.
- 2026-10-17 — Refined draft → ready at the human's request (session: switch session). The half-resolution pass moved to draft 050 (needs a float depth target and softens the pad; not cheap); criteria made measurable (4x steady, before/after, governor-driven).
- 2026-10-17 — Executed (switch session): vegetation per preset, progressive terrain bake, precompile in the right state (scene, planet, march, part materials), kept post chain, delayed shadow map, `low.envSize` 128 (ADR 0055). Hitch 47 to 350 ms down to 14 to 40 ms; the 4x bound is missed by at most 11 ms in 4 of 37 measured switches, so the two hitch criteria stay open (`[~]`) and the plan stays in-progress for the orchestrator's call. Journal 048.

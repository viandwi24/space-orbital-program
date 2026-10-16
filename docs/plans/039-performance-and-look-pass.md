---
id: 039
title: "Release pass: frame budget, mountain haze, radar altitude"
status: in-progress
owner: "perf session (Claude, 2026-10-17)"
depends: [031]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 039 — Release pass: frame budget, mountain haze, radar altitude

## Goal

The flight view meets the ADR 0025 performance budget again on every preset, the mountains read as mountains from 3–12 km, and the HUD shows altitude above terrain, so the physical terrain of plan 031 is releasable.

## Context

- Read: `docs/product/visual-direction.md`, ADRs 0025, 0027, 0036, 0037, 0043, 0044, journals 025, 027, 031 (frame-time tables and self-review).
- Found by the orchestrator reviewing plan 031 (2026-10-17): `high` at the pad 16.0 ms and on a hillside 18.6 ms throughput on an Apple M5 (budget 16.7 ms sync, and M1/M2 are slower); `medium` 17.3 ms on a hillside; mountains a near-white wall from 3 km (`031-after-hor3.png`); `VesselSnapshot.terrainHeight` exists but the HUD does not show radar altitude; GPU/CPU terrain parity worst 0.81 m on the mid patch; preset auto-selection unchanged since plan 019.
- **Measured at refinement (2026-10-17, built-in browser, Apple M5, 1920 x 1080, ratio 1, `high`):** stale flight tabs of finished sessions keep rendering in the background and share the GPU, so a frame time is not repeatable (the same scene read 14 and 30 ms minutes apart). The method is therefore the minimum over 30 windows of 8 frames (throughput: `benchmark`; sync: one frame then a 1 px read-back), taken at quiet moments, and every comparison is an A/B toggled inside one page load. Baseline (thr / sync): pad 14.4 / 17.5, hillside 18.0 / 21.9 (journal 031: 16.0 and 18.6). The empty frame (planet pass and site hidden: post chain, MSAA resolve, vessel) is 1.8 / 2.8 ms, so the post chain is not the cost. Toggles at the hillside: terrain steps 48 to 24 saves 2.0 ms, camera-centred patches off 3.6 ms, view samples 12 to 6 0.8 ms, light samples 5 to 2 0.8 ms, cloud octaves 4 to 2 1.2 ms, terrain shadow steps 0 and MSAA 0 nothing measurable. At the pad: grass tufts and trees (1.4 M triangles in the site group) cost 2.2 ms, steps and shadow map size nothing. Details in journal 039.

## Scope

**In:** profile and cut the terrain/planet/cloud passes (march steps, patch resolution, early-outs, drawing the site only where it can be seen) until every preset fits the budget at the pad, 3 km, 12 km, orbit and hillside scenes with margin for slower GPUs; an automatic quality governor (render scale first, then the preset, when the frame interval stays over budget; with a setting to disable); shader precompile so a preset switch does not hitch; mountain relief and contrast so mountains read at 3 to 12 km without breaking the haze fix of ADR 0037; radar altitude (above terrain) in the HUD next to the existing altitude.
**Out:** volumetric clouds (037), water/site animation/mobile (038); the `ship` script API (radar altitude there is draft 035's neighbour: `packages/scripting` belongs to plan 032 while it runs); the mid patch parity stays at 0.81 m (ADR 0044: float32 noise lattice at 600 km; not attempted, recorded below); M1/M2 and Intel hardware (none here).

## Steps

1. Refine: measure first (toggles inside one page load, CPU sync/throughput; `EXT_disjoint_timer_query_webgl2` is exposed but read 77 ms for 24 ms frames in this setup, so it is not used), set targets, ADR 0053.
2. Governor: pure state machine (`quality-governor.ts`, tested), `Renderer.setRenderScale`, wiring in `flight-loop.ts`, persisted setting `orbital.graphics.auto`, pause-menu toggle, toast on a change.
3. Performance cuts, each measured A/B: site detail by distance, terrain step and patch budgets per preset, cloud and noise cost, program precompile for the other presets.
4. Mountain look: relief and contrast of terrain seen from 3 to 12 km (sky visibility on slopes, snow and rock albedo, snow cover), before/after screenshots at the same camera presets.
5. Radar altitude: pure function (`radar.ts`), HUD model and read-out, tests.
6. Screenshots, frame-time tables, journal, docs.

## Acceptance criteria

Method for every frame time: Apple M5, `high`/`medium`/`low` as stated, 1920 x 1080 at device pixel ratio 1, sync = one frame at a time with a pixel read-back, minimum over 30 windows of 8 frames in one page load; the page was visible or hidden as the journal states.

- [x] **Budget** (target replaced by the orchestrator review of 2026-10-17, see the Log and the ADR 0053 amendment; the first text asked for 13.3 ms sync from every preset): on the Apple M5, `medium` is at most **13.3 ms sync** and `high` at most **16.7 ms sync** at the pad (real sun), 3 km (horizon), 12 km (horizon), orbit (100 km) and hillside (camera on a 1.6 km hill); the governor covers slower GPUs; `low` is reported only. Measured: `high` 6.9 to 14.4 ms (13.7 hillside, worst of four view directions), `medium` 7.4 to 12.8 ms (13.3 at the worst direction). Before/after table in journal 039.
- [x] **Governor tests:** `bun test packages/renderer/test/quality-governor.test.ts` covers the ladder, no change inside the budget, step down only after a sustained overrun, settle time, hidden-tab intervals ignored, probation and doubling back-off, ceiling, disable and restart.
- [ ] **Governor manual run** (done trace-driven, not live: the hidden pane's rAF intervals do not follow the GPU, see journal 039; the ladder steps down to `low` at 0.55 under the device-pixel-ratio-2 load and back up one rung per 22 s after it; the pause-menu toggle and `orbital.graphics.auto = off` restore the preset at full resolution in the real page): with a load added (device pixel ratio 2 at the hillside), the log shows steps down until the interval is under 18.2 ms; after the load is removed it steps up after the probation; the setting `orbital.graphics.auto = off` (and the pause-menu toggle) keeps the preset and full resolution. The run is in the journal with the logged levels and times.
- [ ] **Preset switch hitch** (NOT MET: 130 to 290 ms after the work of this plan against 60 ms allowed on `high`; the remaining cost is the vegetation rebuild and the terrain re-bake, not shader compiles; journal 039, follow-up in draft 048): the longest frame in the 2 s after `setPreset` between all three presets is measured before and after the precompile; after it, at most 4x the steady frame time of the target preset (or the measured reason it cannot be).
- [ ] **Mountains** (3 km 1.52x and 12 km without clouds 1.58x met; 12 km with clouds 1.21x not met; the share above 240 is 0 before and after, journal 039): before/after screenshots at the same camera presets at 3 km and 12 km (`039-before-*.png`, `039-after-*.png`) show readable relief; measured on a fixed rectangle over the massif: the standard deviation of luminance rises at least 1.5x and the share of pixels above 240/255 falls to at most half; the `aerialPerspective` haze tests of ADR 0037 pass unchanged (10 km veil at most 0.6 of the ground).
- [x] **Radar altitude:** `radar.test.ts` and the HUD model test pass in vitest; a screenshot of the HUD on the hillside shows the read-out; it is absent without terrain data.
- [ ] **Checks:** `bun test` (all packages), `bun test packages/renderer`, web vitest, `bun run typecheck` (svelte-check 0 errors), `bun run build`, `bun run docs:check` green; prettier clean on the files this plan touched.

## Docs checklist

- [x] `docs/STATUS.md`, journal 039, ADR 0053, `docs/research/` (Three.js `compileAsync`/program cache, timer query result), architecture note (`architecture/overview.md`; there is no `rendering.md`).

## Log

- 2026-10-17 — Created as draft by the orchestrator from the plan 031 review (performance regression and look gaps are release blockers).
- 2026-10-17 — Refined draft → ready at the human's request (session: perf session). Criteria kept from the draft and made measurable; added the governor, hitch and mountain measures; script API and mid patch parity moved out with reasons.
- 2026-10-17 — Started (ready → in-progress), owner perf session.
- 2026-10-17 — Checkpoint (perf session, stopped early at the coordinator's request: the human's Mac was overheating). Done: governor state machine and tests, `Renderer.setRenderScale`/`precompile`, flight-loop wiring and the persisted setting, march prepass, sun-depth table, site detail by distance, star skip, terrain veil/slope shading/shadow fade, radar altitude function and tests, ADR 0053 (this plan's text says "ADR 0050" in the Scope/AC lines: 0050 was taken by plan 043, the ADR is 0053). Measured, not met: pad and hillside `high` still 15.7 to 18 ms sync on the M5 (target 13.3); 12 km relief ratio 1.31 cloudless (target 1.5; 3 km 1.54 met). Not done: pause-menu toggle and radar read-out in the HUD (the flight page and `InstrumentDeck` wait for plan 032), governor manual run, hitch measurement, final frame tables, journal 039, STATUS issue text. Status stays in-progress.
- 2026-10-17 — Budget target replaced after the orchestrator review (`medium` at most 13.3 ms and `high` at most 16.7 ms sync on the M5 at the five scenes; the governor covers slower GPUs; a half-resolution planet pass is a post-v1 draft unless `medium` cannot meet its target without it). This is a reviewed exception to the first wording, recorded here and in the ADR 0053 amendment.
- 2026-10-17 — Completion session (integration session, Claude): budget met (`medium` 3 cloud and 9 ground octaves, `high` unchanged), radar read-out and pause-menu toggle in the HUD, `lightSamples` removed, biome maps of the other presets built ahead of a switch, journal 039, draft 048 (half-resolution planet pass, cheaper switches). **Stays in-progress**: the preset-switch hitch is not met (130 to 290 ms against 4x the steady frame), the 12 km mountain contrast with clouds is 1.21x (1.58x without), and the governor run is trace-driven. Each needs a ruling from the orchestrator (relax the criterion with a recorded review, or schedule the vegetation/bake work of draft 048 first).

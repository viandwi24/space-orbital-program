---
id: 040
title: "Effects and assets 3: wreckage, plasma shape, trails, multi-nozzle engines, blackout display"
status: done
owner: "effects-3 session (Claude, 2026-10-17)"
depends: [033]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 040 — Effects and assets 3

## Goal

What plan 033 pushed out of the look, as far as it can be done and proven without other hardware: wreckage that stays where a vessel crashed and stages that stay where they came to rest, a plasma shell that follows the vessel's silhouette, a plasma blackout shown in the HUD, an exhaust trail that hangs in the air column, and engines with more than one nozzle. KTX2 and device frame times are pushed out (reasons below).

## Context

- Read: `docs/journal/033-part-assets-effects-and-aero-follow-ups.md` (self-review, "Not done"), ADRs 0021, 0023, 0025, 0028, 0047, 0053, 0055, 0064, 0076, `docs/product/visual-direction.md`, `docs/research/{three,gimbal-damping-and-effects}.md`, journals 020, 026, 033, 049, 051, 054 (frame-time table = the baseline).
- Concurrency: plan 038 works in the environment files of the renderer (planet pass, terrain, water, site) and `flight-loop.ts`; this plan stays in `effects/**`, `parts/**`, small hunks of `scene.ts`, additive core/SDK, `mods/stock` and one new HUD component.

## Decisions taken at refinement (one ADR each, 0077 to 0081)

| # | Item | Decision | Why not the draft's version |
|---|---|---|---|
| 1 | Wreckage and stubs | The **renderer** keeps them (ADR 0077). A destroyed-by-impact event turns the thrown pieces into a wreck that lands, lies flat on the ground height under it and stays 900 s of sim time (at most 8, oldest first). A vessel that disappears at rest on the ground (the sim's `debris at rest` rule) stays as a **remnant**: its part models are kept, frozen in the body-fixed frame (at most 3, 24 parts). ADR 0021 and the sim are unchanged. | The draft assumed the sim must keep the debris. It need not: the renderer already reads vanishing parts as events (ADR 0028 point 4), and a cosmetic wreck cannot block time warp or the contact solver, which is why ADR 0021 removes the real one. |
| 2 | Plasma shape | A shell of revolution built each frame from a **silhouette profile** of the stack (10 bins along the airflow, radius per bin from the oriented part boxes) offset by the shock stand-off `0.143 exp(3.24/M^2) R` (Billig, ADR 0078); no GPU projection, CPU cost measured in the journal. | The draft feared a per-frame GPU projection; a CPU profile of at most a few hundred corners is enough and costs no pass. |
| 3 | Comms blackout | A **display** effect only (ADR 0079): `blackoutLevel` from the same stagnation flux as the heating (ADR 0023); `BlackoutBadge.svelte` in the HUD shows "SIGNAL LOST" with static while the level is over 0.5. There is still no communications system; antennas, delay and control loss are a new draft. | The draft waited for a comms system; the display is honest without one and says nothing about gameplay. |
| 4 | Exhaust trail | A **ribbon** (ADR 0080): sampled points of the nozzle in the body-fixed frame, advected by the wind, widening and fading with age, one dynamic mesh, at most 4 trails of 160 points, density from ambient pressure. | A ribbon is one draw call with no per-fragment march, so it needs none of the cloud budget the draft feared. |
| 5 | Multi-nozzle | `plume.nozzles` (additive, API 0.1.23, ADR 0081): the exit centre of every bell; each gets its own plume; `nozzle` stays the thrust centre for ground effects. Stock gains `stock.engine-cluster` (four bells, gimballed) drawn by a new `engine-cluster` generator; the shock-diamond period follows the exit diameter. | Real art is not needed to judge the layout; a procedural cluster proves the descriptor and the placement. Real models stay possible through 051's asset path. |
| 6 | KTX2 | **Pushed to draft 065** (which already lists it). Measured: `basis_transcoder.wasm` is 515 kB (245 kB gzipped) and `basis_transcoder.js` 56 kB (15 kB gzipped) in three 0.186.1; stock parts use procedural `DataTexture`s and no textured asset exists, so there is nothing to size a VRAM saving against; shipping it now would add about 260 kB gzipped to the bundle for no part. | Not cheap, not justified by numbers. |
| 7 | M1/M2/Intel timings | **Stay in draft 066** (plan 038's "Environment on real devices", same reason): no such hardware exists in these sessions. This plan states its frame times for the Apple M5 only and claims nothing for other GPUs. | |
| 8 | Communications system | New draft 070: antennas, signal range, delay, control loss. | Gameplay and sim, not look. |

## Steps

1. Pure maths with Bun tests: `effects/wreckage.ts` (landing time and rest point of a ballistic piece, lying flat, lifetime and fade, eviction), `effects/plasma-shape.ts` (silhouette profile, stand-off, shell rings), `effects/reentry.ts` (`blackoutLevel`), `effects/trail.ts` (sampling, advection, width, fade, density, ribbon strip), `parts/cluster.ts` (nozzle layout), `plume.ts` (`diamondPeriod`).
2. Wiring in `effects/system.ts` (wreck list, ribbon, silhouette shell) and `scene.ts` (part bounds, remnants), `plasma-mesh.ts`, `plume-mesh.ts`, shaders.
3. Descriptor `plume.nozzles` in core (API 0.1.23), SDK docs, `engine-cluster` generator and `stock.engine-cluster`.
4. `BlackoutBadge.svelte` and the single line that mounts it in the flight page; renderer exports the level.
5. ADRs 0077 to 0081, research, journal, roadmap, STATUS.
6. Screenshots and frame times in the built-in browser (one tab, one server).

## Acceptance criteria

- [x] **Wreckage**: `wreckage.test.ts` (landing time solves `y(t) = floor` to 1e-9, rest on the floor, flat to 1e-6, same seed same wreck, fade 1 to 0 over the last 30 s of 900 s, the 9th evicts the 1st); `wreck-scene.test.ts` (after an impact and 120 s of simulated time the wreck is there and the explosion is gone). `[manual]` `docs/journal/assets/040-wreckage.jpg`.
- [x] **Remnants**: `wreck-scene.test.ts` (kept after 9 s of rest; not kept in flight, hot, moving, high, or as the active vessel; a time jump clears; the 4th evicts the 1st). `[manual]` `040-remnant.jpg`.
- [x] **Plasma shape**: `plasma-shape.test.ts` (wide base against narrow nose in both flight directions, shell = profile + stand-off, Billig to 1e-12 and falling with Mach, rings monotone, never inside the vessel); `[manual]` `040-plasma-shape.jpg`, `040-plasma-front.jpg`; the profile and rings of a 40-part stack take 9 microseconds (limit 0.1 ms, asserted).
- [x] **Blackout**: renderer and web tests as written; `[manual]` `040-blackout.jpg` (the real HUD of a vessel loaded into a return state).
- [x] **Trail**: `trail.test.ts`, `trail-scene.test.ts`; `[manual]` `040-trail.jpg`, `040-trail-far.jpg`.
- [x] **Multi-nozzle**: `cluster.test.ts`; `[manual]` `040-cluster.jpg`.
- [x] **Frame budget** (relative form): the GPU cost of the new draws is within +-0.3 ms on `high` and `medium` (A/B in one page), every non-pad scene is under 16.7 / 13.3 ms, and the burning pad is within +0.55 ms of `base` (HEAD) on `high` and +0.42 ms on `medium`. **The absolute budget does not hold for the burning pad (23.5 to 24 ms `high`, 16.9 to 17.3 ms `medium`) on HEAD either**: pre-existing, journal 040 "Frame times".
- [x] **Preset-switch hitch** not worse than base: 21 to 38 ms after the first visits, base 29 to 53 ms; the first visits (1 092 and 107 ms) are as slow on base (979 and 754 ms).
- [x] `bun test packages/renderer` 530 pass, `bun run test` 1 232 pass, web vitest 725 pass, `bun run typecheck` 0 errors, `bun run build` ok, `bun run docs:check` ok, prettier clean on the files touched. The Playwright suite was not run.
- [x] Pushed items have a draft with a board row: KTX2 in 065 (numbers added), devices in 066, communications in 070.

## Docs checklist

- [x] STATUS, journal 040, ADRs 0077 to 0081 and the index, `docs/research/effects-3.md` and `three.md`, `plugin-system.md` and `guides/writing-a-mod.md` (nozzles), `roadmap.ts`.

## Log

- 2026-10-17 — Created as draft by the control session (pushed out of plan 033).
- 2026-10-17 — Refined draft → ready at the human's request (session: effects-3 session). Decisions above; KTX2 and device timings pushed with reasons.
- 2026-10-17 — Started (in-progress).
- 2026-10-17 — Done. API 0.1.23 (0.1.21 and 0.1.22 were taken by plans 038 and 034 while this one ran). The glow thresholds of `reentry.ts` were lowered (ADR 0078): they had made the plasma invisible in every return at the home body's 2.4 km/s. One absolute figure of the frame-budget criterion is not met by the burning pad, on HEAD too (journal 040); the relative criterion is.

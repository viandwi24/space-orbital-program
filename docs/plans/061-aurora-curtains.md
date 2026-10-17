---
id: 061
title: 'Aurora curtains on the night side at high latitude'
status: done
owner: 'aurora session (Claude, 2026-10-17)'
depends: [054]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 061 — Aurora curtains

## Goal

A night sky at high latitude shows an aurora: green curtains low in the sky, a red upper fringe, moving slowly; from orbit, a faint ring around the pole on the night side.

## Context

- Pushed out of plan 054 (optional item 3 of its draft): the plan's two required items (ozone sky, light shafts) took the session. Research (`docs/research/three.md`, "Plan 054" and "Plan 061"): Lawlor and Genetti's emissive volume (energy by height times a 2D flux footprint, ray marched) and 50-step hobby curtains with triangle noise.
- The planet pass has the stars and the night sky in one pass; an emissive term adds after the atmosphere march, gated by latitude and a dark sky (no cost by day or at low latitude, as the shafts' strength gate does).
- Read: ADRs 0025, 0037, 0053 (and its amendment), 0064, 0069, 0070, 0086 to 0089; journals 054, 056, 062; `docs/product/visual-direction.md`.
- The target is the visual direction's bar, "ready to ship to the public": the aurora is a thing a player will screenshot.

## Design (decided at refinement, ADR 0093)

- A pure model (`aurora-model.ts`): the magnetic axis of a body (rotation axis tilted 9.4 degrees toward longitude -72), the oval (colatitude 23 degrees at magnetic midnight, 12 at noon), the emission profile by height (557.7 nm green near 112 km, violet fringe near 98 km, 630 nm red near 210 km), the curtain footprint (folds and streaks, periodic in time), the gate, and a CPU oracle of the march. The GLSL (`shaders/aurora.glsl.ts`) takes all constants from it.
- A march of `auroraSteps` (low 0, medium 8, high 12) jittered steps through the 80 to 320 km shell inside the planet pass; the part behind the atmosphere goes into the background (the air and the clouds dim it), the part in front is added at the end.
- Compiled in only while the aurora is in reach (`AURORA_STEPS` define, two programs, the variant is precompiled).
- A body's `atmosphere.aurora: false` switches it off (additive API 0.1.24).

## Scope

**In:** the pure model with tests; the march; presets (`low` off); the gate; the per-body flag; screenshots; frame table; docs.
**Out (draft or not planned):** a second launch site (the site is fixed at 0.009 rad latitude, so the pole is only reachable by flying there); sound; moons; the aurora lighting the ground or clouds; a per-body magnetic axis.

## Acceptance criteria

- [x] Bun tests of the pure maths pass: the oval's latitude band (23 and 12 degrees, weight 1 on the centre line, nothing beyond three widths), the emission profile against altitude (green peak, violet fringe, red high, nothing far below or above, normalised lobes, a sharp lower edge), the animation (deterministic, repeats exactly after the period, bounded, no seam, slow), the gate (night, distance to the oval, orbit, a body without an aurora), the march oracle and the shell intervals. `packages/renderer/test/aurora-model.test.ts`: 24 tests, two mutants caught.
- [x] `[manual]` screenshots as JPG: `docs/journal/assets/061-ground-night.jpg` (the ground at magnetic colatitude 24 degrees at night), `061-orbit-night.jpg` (250 km above the oval), `061-day-none.jpg` (the same place by day: none), `061-ground-night-half.jpg` (half rung).
- [x] Frame cost: zero measurable on the day side and at low latitudes against HEAD of the same hour (journal 039/054 scene set at 1920 x 1080: pad, 3 km, 12 km, orbit, hillside; plus day at the oval and night at the launch latitude): within 0.15 ms thr on `high` and 0.10 on `medium` (journal 061 table); and within the ADR 0053 amendment's budget in the aurora scene (`high` 11.45 ms sync, `medium` 10.34 against 16.7 and 13.3).
- [x] The half rung works (`061-ground-night-half.jpg`; aurora scene 7.88 ms thr at half).
- [x] The preset-switch hitch is not worse (journal 061: same pattern as HEAD in the same setup).
- [x] Repo checks: `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, web vitest, prettier (journal 061 lists the output).

## Docs checklist

- [x] STATUS, journal 061, ADR 0093, `docs/research/three.md`, `writing-a-mod.md` and `plugin-system.md` (the `aurora` field).

## Log

- 2026-10-17 — Created as draft by plan 054 (found, not done).
- 2026-10-17 — Refined draft → ready at the human's request (session: aurora session). Verified the oval geometry, emission heights and colours and the technique online (research `three.md`, "Plan 061"); the red line's height and the oval's width have no checked source and are art choices, said so in the model and the ADR. Acceptance criteria made measurable (above), none weakened.
- 2026-10-17 — Started (aurora session). Found while building: `patch` is a reserved word in GLSL ES 3.00 (the pass drew black with a console error only); a comparison against a `git archive` base whose `node_modules` links resolved into the main tree measured the wrong code; a first frame-cost comparison read +1 ms at the pad against a base made before plan 060's commits (the same-HEAD base read the same); the orbit view was overexposed at full strength (`orbitShare` 0.2).
- 2026-10-17 — Executed (aurora session). Criteria: see journal 061. Found, not done: a per-body magnetic axis, the aurora lighting the ground, M1/M2/Intel/phone frame times (not available here).

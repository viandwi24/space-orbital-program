---
id: 253
title: "Graphics phase 1(e): a governor that knows the pixel ratio, steps the planet budget first, and does not stutter on retries"
status: in-progress
owner: "Worker C"
depends: [251]
phase: 7
created: 2026-10-20
updated: 2026-10-20
---

# 253 — Graphics phase 1(e): a governor that knows the pixel ratio, steps the planet budget first, and does not stutter on retries

**Size:** M

## Goal

The quality governor keeps frames steady:
- it drops quality fast when frames are slow;
- it raises quality only when the headroom is measured, not on a timer;
- it never causes a repeating stutter.

## Context

- **Owner order, 2026-10-20:** phases 0 and 1 go into v1.0.0.
- **Research:** `refs/graphics-performance/` 01 §4, 04 §8 and 06 phase 1(e).
- **What the governor does now** (`packages/renderer/src/quality-governor.ts`, `DEFAULT_GOVERNOR` at `:85-96`):
  - budget 1000/55 ms;
  - it steps down after 3 s over budget;
  - it retries a step up after 20 s of calm, doubling to 160 s;
  - preset changes have a 30 s dwell and 60 s probation (plan 201).
- **Why it stutters at Retina `high`:** every failed retry brings back about 3 s of 30–40 ms frames.
- **What it cannot see:**
  - it reads only the rAF interval (`apps/web/src/lib/flight-loop.ts`);
  - it aims at 55 fps even on a 120 Hz display;
  - it cannot tell GPU-bound frames from CPU-bound ones.
- **`selectPreset`** gives any M3 or later `high` whatever its pixel ratio (`presets.ts:182-196`).

## Scope

**In:**
- **Pixel-ratio awareness.** `selectPreset` and the governor's ladder know the pixel ratio. The first rungs lower the planet pass's pixel budget (plan 252), not the whole render scale.
- **Valve-style rules:**
  - drop quickly when over budget;
  - step up only when frames have stayed well under budget at the current rung, for example p95 < 70 % of the budget for N seconds;
  - no blind timer retries, so no failed-trial loop;
  - a locked target of 60 fps, or 30 fps where 60 is out of reach, so pacing is even;
  - a 120 Hz display still targets 60.
- **Plan 201's limit stays:** at most one preset change in 30 s.
- **The Debug panel shows** the governor's reason for each change.

**Out:**
- GPU timer queries. They are missing in Safari, and ADR 0053 says they read nonsense when the page is hidden.

## Touches

- `packages/renderer/src/{quality-governor,presets}.ts`
- `apps/web/src/lib/flight-loop.ts`
- `apps/web/src/lib/debug/*`
- `docs/decisions/` (amend ADR 0053)

## Steps

1. Refine the plan with plan 251's trace and plan 252's rungs. Write the ADR.
2. Implement the rules, with governor unit tests on synthetic frame series:
   - a Retina-like series settles without oscillating;
   - a sudden heavy scene drops within about 1 s;
   - there is no step up without headroom.
3. Record a 2-minute free-flight trace on the M5 with plan 251's histogram, under the lock, on a quiet machine. Put the numbers in the journal.
4. Run light checks, push `ready/253`, and follow the worker brief (batch mode).

## Acceptance criteria

- [ ] Governor tests pass for settle, fast drop, and no blind retries.
- [ ] In a 2-minute free flight on the M5 at Retina `high`: frames over 33.3 ms are under 1 %, and there is at most one preset or rung change per 30 s.
- [ ] Debug shows why each change happened.
- [ ] CI is green on `ready/253`.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with the trace.
- [ ] ADR amending 0053.

## Log

- 2026-10-20: Created by the coordinator from `refs/graphics-performance/06-plan-and-cost.md` phase 1(e), on the owner's order to ship it in v1.0.0. Left as a draft: refine with plan 251's trace. One owner for the governor, as the research advises.
- 2026-10-20 — Worker C claimed (claim/253), before 251 and 252 have landed, on the coordinator's word that the rules and their synthetic tests can start first. ADR 0233 amends 0053. Done: the rules (locked 60/30 with a cadence estimate and a 30 Hz throttle check, fast drops, evidence-only step ups with one trial per rung and scene and a ban on failure), `tick` pacing, `sceneKeyOf`, the host wiring (`flight-loop.ts`: `tick`, the scene key from altitude band, view and body, the reasons and the pacing in Debug → Info). 24 governor tests on synthetic series: a Retina-like series settles without oscillating, a sudden heavy scene drops in about a second, no step up without evidence however long, a failed trial is banned until the scene changes, measured headroom steps up, 120 Hz and 30 Hz displays, the lock to 30.
- 2026-10-20 — Open until 251 and 252 land: the pixel-ratio rungs (the first rungs lower the planet pass's pixel budget; `governorLadder` takes a pixel ratio) and the 2-minute M5 free-flight trace with the frame histogram (acceptance: under 1 % of frames over 33.3 ms, at most one change per 30 s). `Renderer`/the histogram may feed `frame(interval, workMs)` with a GPU work time where one reads sanely; the governor already accepts it.
- 2026-10-20 — Rebased on main with 251 and 252. The ladder reads the pass's budgeted scale (after 30 frames, while at the top): where the pixel budget already draws it near half size (Retina) the half rungs are left out, since they would save almost nothing and cost a trial. A's M5 numbers fed the rules: a 120 Hz screen targets 60 and a frame that just misses takes the third vsync (25 ms), so the over-budget factor and the 50 % window ignore it; a flat 30 ms interval is a cap (Energy Saver), not the GPU (the throttle check). The 2-minute AC trace with this governor is Worker A's run.

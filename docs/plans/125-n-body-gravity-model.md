---
id: 125
title: "N-body gravity model (future; DE440)"
status: done
owner: "Agent 1"
depends: [080, 123]
phase: 8
created: 2026-10-17
updated: 2026-10-18
---

# 125 — N-body gravity model (future; DE440)

## Goal

A world can be created with the n-body gravity model: bodies stay on rails (analytic or DE440 Chebyshev ephemerides), vessels are pulled by every body and integrated numerically, predictions become numerical, warp is limited by the integrator, and Create World's "Coming soon" option becomes selectable. Exploring: this plan is refined only when the owner schedules it.

## Context

- ADRs: 0095, 0103, [0122](../decisions/0122-n-body-restricted-vessels-integrated-bodies-on-paths.md) (decisions of this plan, proposed)
- Read: ADR 0095 point 5, ADR 0103 point 5, ADR 0173 (provider), ADR 0183 (path models), `refs/reverse-engineering-ksp2/beyond/05-universe-mode.md` and `09-time-and-real-solar-system.md` (git-ignored).
- **Scheduled by the owner on 2026-10-18** (in chat: "sambil nunggu 070 ga bisa kah ngerjain 125?"), so it leaves "exploring" (ADR 0108). The DE440 download waits for the owner's yes on the file and its size.

## Scope

**In:**
- `chebyshev` body path model (DE440 records) and its evaluator (ADR 0122 point 1).
- The n-body vessel propagator: dominant-body frame, direct and indirect terms, DOPRI 8(7) on rails, the uniform third-body acceleration in flight (points 2 to 4).
- The warp budget and its refusal reason (point 5); the numerical trajectory provider with maneuver nodes (point 6).
- DE440 as an on-demand mod asset for the Sol pack (point 7); the additive numeric rails state (point 8); Create World's n-body option selectable.

**Out:** n-body for bodies themselves (Universe mode is not pursued, ADR 0108); finite-burn nodes.

## Touches

- **Size:** XL
- **Edits:** `packages/kepler` (propagator, provider, Chebyshev evaluator), `packages/sim` (rails, frames, warp), `packages/core` (schemas, the numeric rails state), `mods/sol` (the DE440 asset), `apps/web/src/lib/worlds` (Create World)
- **Shared contracts:** **core types (provider capabilities, `orbit.model: 'chebyshev'`), save (numeric rails, additive), mod asset format (ephemeris records)**

## Design notes

ADR 0122. The integrator's tolerance and the warp budget are the two numbers to tune with the M5 measurement; the DE440 span is chosen from the measured size per century.

## Steps

1. Chebyshev evaluator against JPL's test points; the `chebyshev` model in the schema.
2. The propagator (equations, DOPRI 8(7), the Kepler limit and Jacobi tests).
3. Rails and flight in the sim; the warp budget; the numeric rails state and its resume test.
4. The numerical provider (predict, nodes, closest approach).
5. The DE440 asset (packing, size, download, cache) and the Sol pack's option; Create World.
6. Measurements on the M5 and the journal.

## Acceptance criteria

- [x] `packages/kepler` test: the Chebyshev evaluator reproduces JPL's DE440 test points (`testpo.440`) within 1e-12 AU for the bodies shipped.
- [x] `packages/kepler` test: with every perturbing body's μ set to 0 the propagator matches the patched conic to 1e-6 relative in position after 10 orbits.
- [x] `packages/kepler` test: in the circular restricted three-body problem (the stock home planet and its moon) a vessel's Jacobi constant stays within 1e-8 relative over 100 days; an object at L4 stays within 1 % of the moon's distance of L4 over 10 moon orbits.
- [x] `packages/sim` test: a save on numeric rails resumes to the bit on the same platform; a format-6 save still loads unchanged.
- [x] `packages/sim` test: warp above the budget is refused or reduced with the reason; the integrator's work at the cap stays under 2 ms per real frame for 20 vessels on rails (M5).
- [x] Prediction: a path predicted by the provider matches what the sim then flies within 1 m after one day.
- [x] The DE440 asset's size per century is measured and stated in the journal; the download is checked by SHA-256 and cached.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/125-n-body-gravity-model.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0095, 0103).
- 2026-10-18 — Refined by Agent 1 as while-waiting work (roadmap §4.4): ADR 0122 (proposed), measurable criteria, steps. Status stays `draft` until the owner schedules the plan (exploring, ADR 0108).
- 2026-10-18 — The owner scheduled it in chat while 070 waits; claimed by Agent 1. Save format 9 was reserved, then released: the numeric rails state is additive (ADR 0122 point 8, amended).
- 2026-10-18 — Built: kepler `nbody.ts` (direct and indirect terms, Bulirsch–Stoer, `nBodyStep`, quintic Hermite), `nbody-path.ts` and the n-body provider (segments with the new end `sample`), `chebyshev.ts`, `ephemeris.ts` (the ORBEPH01 asset); sim numeric rails with dense output, the third-body pull in flight, the warp cap and the frame budget in evaluations, n-body worlds and saves accepted; Sol's NAIF ids and the `table` path; the web's map and aids on the world's provider, Create World's n-body option, the DE440 download with its checks and cache. ADR 0122 points 1, 3, 5, 6, 7 and 8 amended at claim (numbers in the journal). The Launch screen now loads the world's own system (a Sol world's Launch did nothing). API_VERSION 0.1.66.
- 2026-10-18 — Criteria: kepler `ephemeris.test.ts` (testpo 2025–2026 within 1e-12 AU; all 1 042 points of 2000–2100 within 7.1e-15 AU by hand), `nbody.test.ts` (Kepler limit 1e-6 after 10 orbits, Jacobi drift under 1e-8 over 100 days, L4 within 1 %, dense output within 5 cm), sim `nbody.test.ts` (resume to the bit, the cap refused with its reason, prediction within 1 m after a day, 20 vessels held within the frame budget), `de440.test.ts`; e2e `nbody.e2e.ts` (a stock n-body world flies; a 1:1 Sol n-body world fetches DE440 once and flies).

- 2026-10-18 — Merged by Agent 1 (own lane, scheduled by the owner): rebased after 063, 117, 072 and 073; API_VERSION 0.1.68; bun test 1719 pass (20 vessels held at 25 000x with 2 861 evaluations a frame), web vitest 1040 pass, typecheck, build, docs:check, smoke e2e 7 passed; nbody (stock and the 1:1 Sol world with DE440), launch, mission-center, space-center, vessel-panel and worlds e2e pass (Chromium).

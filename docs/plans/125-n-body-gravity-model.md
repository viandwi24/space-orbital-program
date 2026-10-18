---
id: 125
title: "N-body gravity model (future; DE440)"
status: in-progress
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

- [ ] `packages/kepler` test: the Chebyshev evaluator reproduces JPL's DE440 test points (`testpo.440`) within 1e-12 AU for the bodies shipped.
- [ ] `packages/kepler` test: with every perturbing body's μ set to 0 the propagator matches the patched conic to 1e-6 relative in position after 10 orbits.
- [ ] `packages/kepler` test: in the circular restricted three-body problem (the stock home planet and its moon) a vessel's Jacobi constant stays within 1e-8 relative over 100 days; an object at L4 stays within 1 % of the moon's distance of L4 over 10 moon orbits.
- [ ] `packages/sim` test: a save on numeric rails resumes to the bit on the same platform; a format-6 save still loads unchanged.
- [ ] `packages/sim` test: warp above the budget is refused or reduced with the reason; the integrator's work at the cap stays under 2 ms per real frame for 20 vessels on rails (M5).
- [ ] Prediction: a path predicted by the provider matches what the sim then flies within 1 m after one day.
- [ ] The DE440 asset's size per century is measured and stated in the journal; the download is checked by SHA-256 and cached.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/125-n-body-gravity-model.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0095, 0103).
- 2026-10-18 — Refined by Agent 1 as while-waiting work (roadmap §4.4): ADR 0122 (proposed), measurable criteria, steps. Status stays `draft` until the owner schedules the plan (exploring, ADR 0108).
- 2026-10-18 — The owner scheduled it in chat while 070 waits; claimed by Agent 1. Save format 9 was reserved, then released: the numeric rails state is additive (ADR 0122 point 8, amended).

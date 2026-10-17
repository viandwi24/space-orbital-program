---
id: 123
title: "Body orbits from elements with secular rates and a lunar model"
status: in-progress
owner: "Agent 3"
depends: [080, 122]
phase: 8
created: 2026-10-17
updated: 2026-10-18
---

# 123 — Body orbits from elements with secular rates and a lunar model

## Goal

A body's path may be Keplerian elements plus secular rates (JPL approximate positions, Level A) or a periodic series (for the Moon); `stateInParent(t)` evaluates them, the trajectory provider and SOI code use osculating elements at the current time where they assumed a fixed conic, and warp stays analytic up to 1e6.

## Context

- ADRs: 0103, 0095
- Read: ADR 0103 point 5, ADR 0095, `packages/sim/src/bodies.ts` (`stateInParent`), `packages/kepler/src/soi.ts`, `rendezvous.ts`, the trip planner (ADR 0083).
- Look up and record in `docs/research/ephemerides.md`: the JPL "Approximate Positions of the Planets" tables (URL, date, valid span, accuracy) and the chosen lunar series (source, terms, accuracy).

## Scope

**In:**
- `orbit.model`: `kepler` (default, today's fixed conic on the world's time), `kepler-rates` (elements at J2000 with linear rates per second, a mean-motion rate for M, on the J2000 time axis) and `series` (sine and cosine series of ecliptic longitude, latitude and parallax, as the Almanac's Moon); schema in core, evaluators in kepler (`bodyPathState`, `osculatingElements`), with `levelAElements` to turn a JPL Table 1 row into the model's SI form.
- The sim evaluates a body's path at `t + world epoch offset` for the J2000 models, caches it per step, and gives conic consumers (patched-conic predictions, the target's approach) the osculating elements at the current time.
- Accuracy tests against JPL Horizons positions at three dates (`docs/research/ephemerides.md`).

**Out:** the Sol pack content (124), DE440 (125), Table 2's long-span terms, `bodies[].state` for scripts on non-kepler bodies (124 brings the first such bodies), the VAB trip planner (it reads stock bodies, which stay `kepler`).

## Touches

- **Size:** M
- **Edits:** `packages/kepler`, `packages/core`, `packages/sim`
- **Shared contracts:** **core types (`orbit.model`, rates, series)**

## Design notes

Evaluate each body once per step and cache; a rails chunk of 10 s uses the start-of-chunk osculating elements for crossings and refines by bisection.

## Steps

1. Research and record.
2. Evaluators and tests.
3. Osculating helper and consumers.
4. Performance check.

## Acceptance criteria

- [x] `bun test packages/kepler/test/body-path.test.ts`: the Level A evaluator puts Mars, the Earth-Moon barycentre and Jupiter within Table 1's nominal errors (λ, φ, ρ) of JPL Horizons at three dates (2000, 2020, 2040).
- [x] Same file: the Almanac lunar series stays within 0.3° in λ, 0.2° in β and 0.5 % in distance of Horizons at the same three dates.
- [x] `bun test packages/sim/test/body-models.test.ts`: an SOI entry into a `kepler-rates` moon is found within the bisection tolerance of the geometric crossing; `stateInParent` follows the model; stock bodies are unchanged; all existing tests pass.
- [x] Same file, `-t benchmark`: a step with ten `kepler-rates`/`series` bodies costs under 0.05 ms more than with fixed conics (indicative here).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/123-orbits-from-elements-and-a-lunar-model.md` written.
- [x] `docs/research/ephemerides.md`, `architecture/simulation.md`.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103, 0095).
- 2026-10-18 — Refined and claimed by Agent 3. Sources are recorded in `docs/research/ephemerides.md`: JPL Level A Table 1, Horizons reference vectors, and the Almanac low-precision Moon. The new models run on the J2000 axis, and the sim adds the world epoch. The web planner and scripts keep the fixed conic until 124 brings such bodies. Design choices go in ADR 0183.
- 2026-10-18 — Implemented by Agent 3 and handed over as `ready/123`. Every Horizons check is within its bound (the journal has the table). The Moon uses the Almanac low-precision series. Scripts, the planner and the renderer stay on the mean conic until 124. Journal: `journal/123-orbits-from-elements-and-a-lunar-model.md`.

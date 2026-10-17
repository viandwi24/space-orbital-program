---
id: 123
title: "Body orbits from elements with secular rates and a lunar model"
status: draft
owner: ""
depends: [080, 122]
phase: 8
created: 2026-10-17
updated: 2026-10-17
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
- `orbit.model`: `kepler` (today), `kepler-rates`, `series`; schema and evaluators in kepler/core.
- Osculating elements helper; consumers that need a conic take it at the current time.
- Accuracy tests against reference positions from the research sources (a handful of dates).

**Out:** the Sol pack content (124), DE440 (125).

## Touches

- **Size:** M
- **Edits:** `packages/kepler`, `packages/core`, `packages/sim`, `apps/web/src/lib/vab`
- **Shared contracts:** **core types (`orbit.model`, rates, series)**

## Design notes

Evaluate each body once per step and cache; a rails chunk of 10 s uses the start-of-chunk osculating elements for crossings and refines by bisection.

## Steps

1. Research and record.
2. Evaluators and tests.
3. Osculating helper and consumers.
4. Performance check.

## Acceptance criteria

- [ ] `packages/kepler` test: the Level A evaluator reproduces the published example positions within the stated accuracy at three dates.
- [ ] `packages/kepler` test: the lunar series stays within the source's stated error against reference positions at three dates.
- [ ] `packages/sim` test: SOI crossings with a `kepler-rates` moon are found within the bisection tolerance; all existing tests pass.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/123-orbits-from-elements-and-a-lunar-model.md` written.
- [ ] `docs/research/ephemerides.md`, `architecture/simulation.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103, 0095).

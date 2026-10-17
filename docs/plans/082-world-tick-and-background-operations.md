---
id: 082
title: "World tick and background operations"
status: draft
owner: ""
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 082 — World tick and background operations

## Goal

The sim runs a `world-tick` phase once per game day at the exact day boundary (also under warp, one tick per day in order), world systems draw from per-system PRNG streams, and unloaded vessels keep working through closed forms (rate × Δt) evaluated on ticks and on demand.

## Context

- ADRs: 0096
- Read: ADR 0096, `docs/architecture/simulation.md` (loop, rails chunks of 10 s, SOI bisection), `packages/core/src/rng.ts`.

## Scope

**In:**
- System phase `world-tick` in `defineSystem`; ordering rule; `world:tick` event with the day number.
- Chunk splitting at day boundaries in both the fixed-step and the rails path.
- PRNG streams derived from (world seed, system id).
- Background-operation helper: a module may declare `background(rate, state, dt)` closed forms; the sim calls them on ticks, wake and save.
- Last processed tick saved.

**Out:** economy, crew, contracts themselves (they register on this tick in their plans).

## Touches

- **Size:** M
- **Edits:** `packages/sim/src/sim.ts`, `packages/sim/src/core.ts`, `packages/core/src/rng.ts`, `packages/sdk`, `mods/stock`
- **Shared contracts:** **SDK (system phase, module `background`), save (last tick, per-system PRNG state)**

## Design notes

At warp 1e6 a 10 s chunk covers about 116 game days of the stock calendar: the loop runs ticks inside the chunk in order; measure the cost of 1 000 empty ticks.

## Steps

1. Phase and event; boundary splitting with tests at warp 1 and 1e6.
2. PRNG streams; determinism test with two systems registered in different orders.
3. Background helper and a stock example (a battery charging from a solar panel while unloaded).
4. Resume test across a tick.

## Acceptance criteria

- [ ] `packages/sim` test: warping 100 game days from day 0 fires exactly 100 `world:tick` events with consecutive day numbers, each at the boundary time to 1e-6 s.
- [ ] `packages/sim` test: adding a second world system does not change the first system's random draws.
- [ ] `packages/sim` resume test: a save taken mid-day resumes and fires the next tick at the same time as the uninterrupted run.
- [ ] Benchmark: 1 000 ticks with stock systems under 0.5 ms each on average (M5, journal).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/082-world-tick-and-background-operations.md` written.
- [ ] `docs/architecture/simulation.md` (world tick), `plugin-system.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0096).

---
id: 082
title: "World tick and background operations"
status: in-progress
owner: "Agent 3"
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 082 — World tick and background operations

## Goal

The sim runs a `world-tick` phase once per game day at the exact day boundary (also under warp, one tick per day in order), world systems draw from per-system PRNG streams, and unloaded vessels keep working through closed forms (rate × Δt) evaluated on ticks and on demand.

## Context

- ADRs: 0096 (the decision), 0103 (calendar, epoch), 0110 (world info, save format 5), 0111 (rules in the system context), 0171 (written in step 1: day length, tick timing in flight, save fields).
- Read: ADR 0096, `docs/architecture/simulation.md` (loop, rails chunks of 10 s, SOI bisection), `packages/sim/src/sim.ts` (`flightStep`, `railsStep`, `step`), `packages/sim/src/core.ts`, `packages/sim/src/hooks.ts` (`runUpdateHooks`), `packages/sim/src/modes.ts`, `packages/sim/src/save.ts`, `packages/core/src/rng.ts`, `packages/core/src/save.ts` (`simSaveSchema`), `SystemDefinition` in `packages/core/src/definitions.ts`.

## Scope

**In:**
- System phase `world-tick` in `defineSystem`, with an optional `order` (lower first; then plugin boot order; ties by id). A world-tick system's `update(world, dt, ctx)` gets `dt` = the day length and `ctx.tick` = `{ day, time, rng }`. The `world:tick` event carries `{ day, time }` and is emitted after the world systems ran.
- **Day length** (until plan 081 supplies the calendar): the root body's `rotationPeriod` (stock: 21 600 s). Day number at time `t` = `epoch.day + floor(epoch.fraction + t / dayLength)`. A tick fires on entering each new day; there is no tick at `t = 0`.
- Rails path: a chunk that crosses a boundary is split there (the boundary time is computed from the day number, not accumulated), and a long warp runs every tick in order. Flight path: the fixed 20 ms step is not split; the tick runs at the end of the step that crosses the boundary, with `time` = the exact boundary (ADR 0171).
- PRNG streams: `createRng(streamSeed(world seed, system id))` per world-tick system, independent of registration order and of other systems.
- Background operations: a module may declare `background(ctx, dt)`, a closed form over the elapsed time. For a vessel on rails the sim calls it on every world tick, when the vessel wakes into flight, and before a save, with `dt` = time since its last call (per vessel `backgroundAt`). It does not call that module's `updateOnRails`. Modules without `background` keep today's per-chunk `updateOnRails`.
- Save: optional `worldTick: { lastDay, streams: { [systemId]: rngState } }` in `SimSave` format 5 (additive; a save without it derives `lastDay` from its time and starts fresh streams); `backgroundAt` on the vessel component.

**Out:** economy, crew, contracts themselves (they register on this tick in their plans); a stock solar panel or other generator (stock has electric charge but no producer: draft 190); the calendar and dates (081); spreading a burst of ticks across frames at maximum warp (measured here, built when a system needs it).

## Touches

- **Size:** M
- **Edits:** `packages/sim/src/sim.ts`, `packages/sim/src/core.ts`, `packages/sim/src/hooks.ts`, `packages/sim/src/modes.ts`, `packages/sim/src/save.ts`, `packages/sim/src/state.ts`, `packages/sim/src/tick.ts` (new), `packages/sim/test/world-tick.test.ts` (new), `packages/core/src/rng.ts`, `packages/core/src/definitions.ts` (`SystemPhase`, `SystemDefinition.order`, `SystemContext.tick`, module `background`), `packages/core/src/events.ts` (`world:tick`), `packages/core/src/save.ts` (optional `worldTick`), `packages/core/src/version.ts`, `packages/sdk`, `docs/architecture/simulation.md`, `docs/architecture/plugin-system.md`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** **SDK (system phase `world-tick`, `order`, `ctx.tick`, module `background`, event `world:tick`; `API_VERSION` patch bump), save (optional `worldTick` in format 5, vessel `backgroundAt`; no format bump)**

## Design notes

At warp 1e6 a 10 s chunk covers about 116 game days of the stock calendar: the loop runs ticks inside the chunk in order; measure the cost of 1 000 empty ticks.

## Steps

1. ADR 0171; phase, `order`, context and event; rails splitting and the flight-step rule; tests at warp 1 and 1e6.
2. PRNG streams; determinism test with two systems registered in both orders.
3. Background helper with a test-fixture module (a battery charged by a panel while on rails); draft 190 for a stock generator.
4. Save fields and the resume test across a tick; benchmark.

## Acceptance criteria

- [ ] `bun test packages/sim/test/world-tick.test.ts`: warping 100 game days from day 0 (warp 1e6, rails) fires exactly 100 `world:tick` events with days 1..100, each `time` within 1e-6 s of `day × 21 600`; at warp 1 in flight a tick fires within one 20 ms step of the boundary with the exact boundary `time`.
- [ ] Same file: a world system's draws are the same with and without a second world system, registered before or after it.
- [ ] Same file: world-tick systems run in `order`, then boot order, then id.
- [ ] Same file: a save taken mid-day resumes and fires the next tick at the same `time` and day, with the same draws, as the uninterrupted run; a save without `worldTick` (format 5 from 077) loads and fires no duplicate tick.
- [ ] Same file: a fixture battery on a vessel on rails charges by rate × elapsed time on ticks, on wake and before a save; its `updateOnRails` is not called; a module without `background` is unchanged.
- [ ] Same file, `-t benchmark`: 1 000 ticks with stock loaded and 50 vessels on rails average under 0.5 ms each ¹ (M5, run by Agent 1; indicative here).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/082-world-tick-and-background-operations.md` written.
- [ ] `docs/architecture/simulation.md` (world tick), `plugin-system.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0096).
- 2026-10-17 — Refined and claimed by Agent 3. Day length is the root body's `rotationPeriod` until 081 supplies the calendar. The flight step is not split; its tick carries the exact boundary time. `background` replaces `updateOnRails` for the modules that declare it. The save gets an optional `worldTick` in format 5, with no format bump (ADR 0171). Stock has no electric-charge producer, so the background example is a test fixture, and a stock solar panel is draft 190.

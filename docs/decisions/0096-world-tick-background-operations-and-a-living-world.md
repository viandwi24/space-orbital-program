# 0096 — A world tick, background operations, and a living world of AI agencies

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "living-world", "agency-type", 2026-10-17); delivered by plans 082, 126
**Builds on:** ADR 0003 (headless sim), 0021 (rails and warp), 0050 (saves), 0094 (worlds).
**Research:** `refs/reverse-engineering-ksp2/beyond/03-world-and-economy-dynamics.md`, `beyond/07-recommendations.md` §6.

## Context

Nothing in Orbital happens unless a vessel flies. Economy (upkeep, salaries, markets), construction, contracts with deadlines, crew rest, background science and data transmission, and AI agencies all need time to pass at the level of the world, deterministically and under warp. The owner chose a living world: rival agencies simulated cheaply, but whose successes put real, visible objects (satellites, relays) into the player's world that can be targeted and rented. The agency type of the player (government, company or hybrid) is chosen at world creation.

## Decision

1. **World tick.** A new system phase `world-tick` in the sim runs once per **game day** (the calendar day of the world's system, ADR 0103), at the exact day boundary. A step or a rails chunk that crosses a boundary is split there (as SOI crossings are, ADR 0051); a long warp runs every tick in order, never merges them. Order inside a tick: registered world systems by declared order, then by plugin boot order, ties by id.
2. **Determinism.** World systems read no clock and draw randomness from a PRNG stream derived from the world seed and the system's id, so adding a system or a mod does not change another system's draws. All world state is plain data in the sim world and saved.
3. **Background operations.** Vessels that are not in flight keep working by closed forms over the elapsed time: rate × Δt for power, life support, experiments and transmission, evaluated on each tick and on demand (wake, save, query). No inactive vessel is stepped.
4. **Living world.** 3 to 6 AI agencies per world are small state machines on the world tick (budget, reputation, programme, next mission, risk). A successful agency mission creates a **real on-rails object** in the world (a vessel with an `owner` agency and no physics while unloaded) that the map, Mission Center and target code see like any vessel; relays can be rented once comms exist (ADR 0101). Agencies compete for world firsts (ADR 0098), feed markets and reactive contracts, and publish news. Their number and aggressiveness are world rules; Sandbox has none by default.
5. **Agency type of the player** (`government` / `company` / `hybrid`) is an identity rule chosen at creation; it selects funding sources and the strategies on offer (ADR 0098).

## Alternatives considered

- **No world simulation** (KSP1 and KSP2) — rejected: every owner choice for economy, crew and agencies needs time to pass.
- **Tick per sim step** — rejected: wasteful under warp and harder to reason about; a day is the unit players and the systems think in.
- **Fully simulated rival vessels** (flown by an AI) — rejected: cost and fragility; abstract agencies with real resulting objects give the same visible world for a fraction.

## Consequences

- **Mod API:** world systems register through `defineSystem` with phase `world-tick` (additive); a typed `world:tick` event.
- **Save format:** the last processed tick and each world system's state are world components (format 5 or a later additive bump with migration).
- **Performance:** budget per tick 0.5 ms on the M5 reference for the stock systems at 50 vessels and 6 agencies; at the maximum warp a burst of ticks is spread so a sim step stays inside the 4 ms of the spec (`product/spec.md` §5); plan 082 measures it. The renderer budget (ADR 0053) is unaffected.
- **Snapshot:** agency objects appear as vessels with an owner; the news feed is a bounded list in the world.
- Follow-ups: plan 082 (tick, background operations), plan 126 (agencies, objects, news, reactive contracts).

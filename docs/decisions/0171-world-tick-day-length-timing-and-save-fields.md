# 0171 — World tick: day length, timing in flight and on rails, order, streams, background and save fields

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 082
**Builds on:** ADR 0096 points 1 to 3 (world tick, determinism, background operations), 0103 (epoch, calendar), 0110 (world info, save format 5).

## Context

ADR 0096 asks for a `world-tick` phase once per game day at the exact boundary, PRNG streams per system and closed-form background work for vessels that are not in flight. Several things are still open: which day the tick counts before the calendar exists (plan 081 runs in parallel), what "split at the boundary" means for the fixed 20 ms flight step, how world systems are ordered and see their day, how `background` relates to the existing `updateOnRails` hook, and where the tick's state goes in a save without a new format number.

## Decision

1. **Day length.** A tick day is the root body's `rotationPeriod` (stock: 21 600 s). Today the root is the home body, so this is its solar day, the day plan 081's fictional calendar counts. When 081 or 122 (Sun as root) change what a day is, they change the one function `dayLength` in `packages/sim/src/tick.ts`, and the tick follows.
2. **Day number.** `day(t) = epoch.day + floor(epoch.fraction + t / dayLength)`. The tick for day `n` fires on entering it, at `time(n) = (n − epoch.day − epoch.fraction) × dayLength`. Each boundary time is computed from its day number, never accumulated, so warp does not drift it. There is no tick at `t = 0`.
3. **On rails** a chunk that would cross a boundary stops at it. The ticks run, then the chunk continues. A long warp runs every tick in order and never merges two.
4. **In flight** the fixed step is not split (physics needs a constant `dt`). The tick runs at the end of the step that crossed the boundary, so at most 20 ms late, and its `time` is still the exact boundary time. World systems read no clock (ADR 0096 point 2), so nothing they compute depends on the offset.
5. **Order and context.** World-tick systems are `defineSystem({ phase: 'world-tick', order?, update })`. They run in ascending `order` (default 0), then plugin boot order, then by id. `update(world, dt, ctx)` gets `dt = dayLength` and `ctx.tick = { day, time, rng }`. After the systems, the sim emits `world:tick` `{ day, time }`.
6. **Streams.** Each world-tick system draws from `createRng(streamSeed(worldInfo.seed, system.id))`. `streamSeed` is a 32-bit FNV-1a hash over the seed's decimal text and the id. A system's stream depends only on the world seed and its own id, so adding, removing or reordering other systems never changes its draws. The sim's own `rng` is untouched.
7. **Background.** A module may declare `background(ctx, dt)`, a closed form over `dt` seconds. For a vessel on rails the sim calls it on every tick (before the world systems), when the vessel wakes into flight, and before a save. `dt` is the time since that vessel's last evaluation (`backgroundAt` on the vessel component, set when it goes on rails; a vessel without one starts counting at its first evaluation). For such a module the sim no longer calls `updateOnRails` on rails: one or the other works the vessel, never both. Modules without `background` keep the per-chunk `updateOnRails` of today.
8. **Save.** `SimSave` (format 5) gets an optional `worldTick: { lastDay, streams: { [systemId]: rngState } }`. A save without it (older format-5 saves, migrated format-4 saves) takes `lastDay = day(time)`, so it fires no duplicate tick, and starts fresh streams. It is additive and optional, so the format number does not change, and no number is reserved. `backgroundAt` is an optional field of the vessel component inside the ECS world, which the world format already carries.

## Alternatives considered

- **A fixed 86 400 s day** — rejected: the stock home planet turns in 6 hours, and the calendar of plan 081 counts its day.
- **Split the flight step** — rejected: a variable physics step changes the Rapier solution (ADR 0018) for a 20 ms offset that no world system can observe.
- **Bump the save format for the tick state** — rejected for now: an optional field with a derivable default needs no migration. A later change that is not derivable gets a number from the Lead.
- **Run `background` and `updateOnRails` together** — rejected: a module would count the same elapsed time twice.

## Consequences

- **Mod API:** phase `world-tick`, `SystemDefinition.order`, `SystemContext.tick`, `ModuleDefinition.background`, event `world:tick`: additive, `API_VERSION` patch bump.
- **Performance:** a tick costs the background calls for vessels on rails plus the world systems. Plan 082 measures 1 000 ticks with 50 vessels. At warp 1e6 a 10 s chunk covers about 46 stock days, all run in order.
- Plans 095, 098, 102, 106, 114, 126 and 128 register on this tick.
- **Extended by ADR 0213** (plan 208): `VesselApi.sunExposure` lets a `background` hook integrate sunlight over its interval along the rails path.

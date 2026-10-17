# 0143 — Worlds in the web client: the record carries a new world's info, one active world, slots per world, catch-up only on a real calendar

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [087](../plans/087-worlds-screen-and-create-world.md)
**Builds on:** ADR 0094 (worlds are saves, modes are presets), ADR 0110 (world records own saves), ADR 0111 (rules and presets), ADR 0103 points 2 and 3 (start date, catch-up), ADR 0141 (epoch and calendars), ADR 0142 (sites)

## Context

Plan 087 adds the Worlds screen and Create World. The world contract exists (077, 078, 081, 084), but the web client has no notion of a current world: every flight is the Legacy world, the quick and autosave slots are global, and a world record never changes after it is written. Five things were open:

1. A created world has no save yet, so where does its `WorldInfo` (seed, rules, epoch, sites) live until the first save?
2. How does the VAB → flight path know which world a launch belongs to?
3. Quick and autosave slots would overwrite each other across worlds.
4. ADR 0103 offers a start date of "today" and "Catch up to now", but ADR 0141 counts a fictional calendar's day 1 from the epoch: a stock world started "today" would read "Day 39 142".
5. The refs mock shows a difficulty, which no rule or preset has.

## Decision

1. **The record carries the world's info.** `WorldRecord.world?: WorldInfo` (record format 1, an optional field, so older records still parse) holds the info of a world created in the dialog. A flight in a world with no save starts the sim with that info (`createSim({ world })`, through the worker's `init` message); after the first save, `SimSave.worldInfo` is the truth and the record keeps its copy for Duplicate. The Legacy record has no `world`: the sim makes the Legacy world as before.
2. **One active world.** The page remembers the active world id (`orbital.world` in `localStorage`; absent = Legacy). Enter world makes it active and loads its newest save, or opens the VAB when it has none; the VAB's launch then flies in the active world. Main menu Continue enters the world played last. Every save write updates the owning record's `lastPlayedAt` and `summary`.
3. **Slots per world.** Quick and autosave slot ids carry the world: `<world>:quick`, `<world>:auto-<n>`; the Legacy world keeps `quick` and `auto-<n>`, so existing saves stay where they are. The Load dialog lists the active world's saves.
4. **Start date and catch-up need a real calendar.** On a `gregorian-utc` system Create World offers Today (the clock read once, `epochFromUnixMs`), a fixed date, and J2000, and loading such a world behind the real date offers "Catch up to now" (`warp-to` the real date's sim time, only when every vessel is on rails, never backwards; also a button beside the time control). On a fictional calendar (stock) a world starts on day 1 (`epoch { 0, 0 }`); the start-date choice is shown disabled with that reason, and no catch-up is offered: there is no real date to catch up to.
5. **No difficulty.** Presets are the modes (ADR 0094); every rule is editable in the dialog, and a world whose rules differ from its preset's values is labelled "Custom". A difficulty field returns only with a plan that defines what it changes.

## Alternatives considered

- **Write an empty first save at creation** — rejected: a save needs a vessel and a sim run; an empty sim save would be a second, invented format.
- **Pass the world id in the URL to every page** — rejected: the VAB, the flight and the menu would all have to forward it; one remembered active world is what the player means by "the world I am in".
- **Catch-up on a fictional calendar from the real time since creation** — rejected: it would warp a stock world by the hours the browser was closed, which no rule asks for.

## Consequences

- `apps/web` gains `lib/worlds/` (create, duplicate, rename, delete, active world, catch-up maths) and the `/worlds` route; the init message and `startSimWorker` take an optional `world`.
- Deleting a world deletes the saves that name it.
- When a real-calendar system ships (the Sol pack, ADR 0103 point 6), its worlds get Today and catch-up without UI work.

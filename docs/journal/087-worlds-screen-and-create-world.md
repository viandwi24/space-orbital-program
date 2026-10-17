# 087 — Worlds screen and Create World

**Plan:** [plans/087-worlds-screen-and-create-world.md](../plans/087-worlds-screen-and-create-world.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-17 · **ADRs:** [0143](../decisions/0143-worlds-screen-active-world-record-world-info-and-catch-up.md) (new), [0094](../decisions/0094-worlds-are-saves-modes-are-presets-over-rules.md), [0103](../decisions/0103-time-calendar-sun-and-the-real-solar-system.md), [0107](../decisions/0107-ui-adopts-the-refs-visual-language-in-stages.md), [0141](../decisions/0141-calendar-on-the-root-body-epoch-from-j2000-and-a-year-only-with-an-orbit.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `lib/worlds/world-model.ts` | pure: `ruleGroups`, `presetRules`, `isCustom`, `isIdentityRule`, `startDatesFor`/`startEpoch`, `createWorldInfo` (validated by `worldInfoSchema`: n-body refused; unknown preset refused), `duplicateWorldInfo`, `catchUpOffer`/`catchUpCommand`/`behindText` |
| `lib/worlds/worlds.ts` | storage over the world and save stores: `list` (last played first, damaged records listed with their error), `create`, `rename`, `duplicate`, `remove` (with the world's saves), `touch`, `startInfo`, `saves`; the active world (`orbital.world`) |
| `lib/worlds/catalog.ts`, `enter.ts`, `CreateWorld.svelte` | the form's registries (stock plus enabled mods), Enter world (active, touch, newest save or the VAB), the Create World dialog generated from the registries |
| `lib/save/world-record.ts` | `WorldRecord.world?: WorldInfo` (optional, record format 1) |
| `lib/save/saves.ts`, `save-controller.svelte.ts` | slots per world (`slotId`); the Load dialog and F9 follow the active world; every save touches its world; `worldsService`, `worldStartInfo` |
| `messages.ts`, `save/worker-save.ts`, `sim.worker.ts`, `sim-client.ts`, `flight-loop.ts` | the world travels in `init` to `createSim({ world })`; `Flight.catchUp`, `acceptCatchUp` |
| `routes/worlds`, `routes/+page.svelte`, `routes/flight/+page.svelte`, `lib/hud/WarpControl.svelte` | the Worlds screen; Continue enters the world played last, a Worlds entry; a load makes its world active and a new flight starts in the active world; "Catch up to now" beside the time control |
| `packages/core/src/calendar.ts` | a fix found here: a date a hair before a whole minute read `.001` past it (`formatDate` now formats the minute's start) |
| tests | `world-model.test.ts` (10), `worlds.test.ts` (5), `CreateWorld.test.ts` (3), `WarpControl.test.ts` (+1), `saves.test.ts` (+1), core `calendar.test.ts` (+1), `e2e/worlds.e2e.ts` |

## What surprised me

- **A created world has nowhere to live.** The world info travels in `SimSave.worldInfo`, and a new world has no save. ADR 0143 point 1: the record carries it until the first save.
- **The quick and autosave slots were global**, so a quicksave in one world would have replaced another world's; they are per world now, with the Legacy world keeping the plain ids so nothing moves.
- **"Today" on a fictional calendar** would read "Day 39 142" (ADR 0141 counts day 1 from the epoch). The stock system starts on day 1 and offers no catch-up; Today, a fixed date and J2000 and the catch-up are for a `gregorian-utc` system (ADR 0143 point 4), tested with one.
- **No difficulty exists** in code (the refs mock has one); presets are the modes, and a world that differs from its preset is labelled "Custom" (ADR 0143 point 5).
- **The record's `preset` was a label** (`'sandbox'` for the Legacy world) and is the preset id for new worlds; the screen looks up both.
- In the e2e, F5 before the flight can be saved does nothing visible; the test presses it until the status says "Quicksaved.", and the status text is read through `role=status` (a hidden live region carries it too).
- Found and fixed in core: `formatDate` showed `12:00:00.001` for an instant 0.1 ns before noon (081's minute carry added a millisecond).

## Decisions made

- [ADR 0143](../decisions/0143-worlds-screen-active-world-record-world-info-and-catch-up.md): the record carries a new world's info; one active world; slots per world; start date and catch-up only on a real calendar; no difficulty.

## Open questions / follow-ups

- Enter world opens the VAB or the newest save until the Space Center screen (091) exists; then it opens the Space Center.
- The world card's planet is a gradient from the tokens; a rendered thumbnail is out of scope (plan).
- Site templates (092) and the agency type's effects (126) consume what Create World stores now.

## Verification output

See the plan's Log.

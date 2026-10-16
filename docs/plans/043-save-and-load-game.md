---
id: 043
title: "Save and load game"
status: done
owner: "save session (Claude, 2026-10-17)"
depends: []
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 043 — Save and load game

## Goal

A player can quicksave/quickload, keep named saves, get an autosave, close the tab and resume the flight exactly (all vessels, debris, time, warp state, module states), with a versioned, migratable save format and a load screen in the main menu.

## Context

- ADR 0048 (v1 scope), [ADR 0050](../decisions/0050-save-format-and-resume.md) (format, what is saved, bodies rebuilt, tolerance, migration policy). Research: `research/save-and-load.md`.
- World serialisation exists (`world.serialize`, plan 003); sim state outside the world (clock, accumulator, PRNG, flight-frame bodies) is what `Sim.save()` adds. Library storage pattern: ADR 0041 (IndexedDB). SAS state round-trips as plain data (ADR 0049, journal 042).
- Concurrency: plans 039 (flight-loop, HUD, graphics) and 042 (flight integration hunks) own `flight-loop.ts`, `hud-controller.ts` and the flight page until they are done; this plan integrates into them last (`docs/journal/assets/043-integration.patch`).

## Scope

**In:** `sim.save()` / `createSim({ resume })` (additive; API 0.1.12), determinism after resume, the versioned format with migration chain and checksum (`@orbital/core`), save storage in IndexedDB with export/import file, save list UI with thumbnail/time/vessel, F5/F9, autosave (timer, stage, landing, tab hidden), corrupt-save handling, the save dialogs in the pause menu and a "Load a flight" button on the main menu.
**Out:** cloud saves; saving script state (a script stops on load, its text is kept as before); second-body state (plan 044 extends `SimSave`).

## Steps

1. Format and API in core and sim (ADR 0050). 2. Resume determinism tests. 3. Web save library (store, manager, autosave logic, dialogs, Worker `init`/`save` messages). 4. Integration into the flight page, flight loop, HUD controller and main menu. 5. Browser run.

## Acceptance criteria

Headless criteria are in `packages/sim/test/resume.test.ts` (rig: the stock sim, 16 solver iterations, JSON text round trip of every save).

- [x] **Resume determinism, byte for byte:** a sim resumed from `JSON.parse(JSON.stringify(sim.save()))` and an uninterrupted one, run on with the same inputs, have identical `JSON.stringify` of snapshot, serialised world, clock and PRNG at every simulated second, for: mid-ascent under thrust with attitude input (20 s), right after staging with a second vessel in flight (20 s), on orbital rails at 100x warp then woken and burning (14 s), on surface rails then woken by the throttle (12 s), during an SAS hold then a pointing mode and manual input (12 s). The resumed sim's own `save()` equals the one it came from byte for byte.
- [x] **Resume determinism with ground contact, bounded:** on the pad (flat ground: measured 4e-9; terrain: 1.3e-3 over 8 s) and landed on legs on terrain (9.4e-4 over 6 s), every number stays within 5e-3 (m, m/s, rad, K) and every discrete value is equal. Rapier cannot restore the contact solver's warm start; ADR 0050 point 4 states the bound and why. Mutation check: dropping the angular velocity on restore fails 5 of the 10 cases; dropping the warp fails 3.
- [x] **Migration:** a frozen v1 fixture (`packages/sim/test/fixtures/save-v1.json`, two vessels, one in flight) loads and resumes, and its re-save equals the file; the migration chain (v1 to v2 to v3 with injected steps, `packages/core/test/save.test.ts`) upgrades step by step, checks the checksum against the file's own version, re-signs the result and reports a missing step.
- [x] **Corrupt, foreign and incompatible saves** are refused with a `SaveError` and a readable message (`code` `not-json`, `not-a-save`, `too-new`, `damaged`, `missing-mod`, `incompatible`): other JSON, text that is not JSON, cut-off text, an edited number (checksum), a newer format, a mod or part that is not loaded (named), inconsistent rails, a missing component field, a flight vessel without a body, a body for a vessel not in flight, another fixed step, too many frames (`save-format.test.ts`, `save.test.ts`).
- [x] **Web logic (vitest, 48 tests in `apps/web/src/lib/save`):** list newest first with damaged records shown; quicksave replaces its slot; autosave rotation keeps the newest three and leaves quick and named saves alone; unique names; rename and delete; quota error reported as `quota` with the previous save intact; other storage errors as `unavailable`; export/import round trip and refusal of junk without storing anything; mod report; autosaver timing (interval, minimum gap, busy, paused, tab hidden); Worker `init`/`save` routing and `SimClient.save()`; the controller (quicksave/quickload, mods missing/changed, failures become notes).
- [x] **`[manual]` browser, on a scratch copy of the tree with the integration patch** (built-in browser, port 5199): launch, throttle and stage, F5 in flight, reload the tab, Load a flight from the main menu, the flight continues from the saved altitude with throttle, stage count and thrust; a pad quicksave reloaded and flown to a 76.0 x 289.8 km orbit with the dev autopilot; a named save in orbit reloaded with the same periapsis and apoapsis to the metre and 100x warp working. Screenshots `docs/journal/assets/043-load-screen.png`, `043-orbit-after-load.png`. Note: the dev autopilot assumes a fresh vessel (it fires stage 0 first), so the mid-ascent save was resumed by hand, not flown to orbit by it (journal 043).
- [x] **Integration into the real tree** (flight page, flight loop, HUD controller, pause menu, help overlay, main menu): applied from `docs/journal/assets/043-integration.patch` (`patch -p1 -F3`; two hunks were merged by hand: the `@orbital/core` import in `flight-loop.ts` and the `PauseMenu` props next to plan 039's toggle) on top of plans 039 and 042. The `[manual]` run was repeated on the real tree: F5 at 20.3 km with throttle 100 % and stage 2 burning, tab navigation to the main menu, "Load a flight", Quicksave: resumed at T+01:29 (saved T+01:24), 23.3 km, throttle 100 %, SAS prograde still on; a named save "Two-stage in orbit" from the pause menu reloaded from the main menu with apoapsis 289 693.4998 m and periapsis 76 038.5921 m, equal to the digits before the save, and the warp buttons took it to 50x (99.8 s in 2 s). Screenshots `043-integrated-*.jpg`.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on touched files (repeated after the integration; journal 043). The web suite is vitest (`bun run test` is `bun test packages mods`; running `bun test` inside `apps/web` is the wrong runner for the `.svelte.ts` controller tests and is what failed in journal 047).

## Docs checklist

- [x] STATUS, journal 043, ADR 0050, `architecture/simulation.md`, research `save-and-load.md`, `guides/writing-a-mod.md` (state in the world), API 0.1.12 in `plugin-system.md`.
- [x] STATUS board row to `done` (`product/spec.md` lists v1 as prose, there is no checkbox to tick).

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
- 2026-10-17 — Refined draft → ready at the human's request (session: save session): measurable criteria, ADR 0050, research.
- 2026-10-17 — ready → in-progress (save session). Core format and sim save/resume committed; web save library, dialogs and Worker messages committed; headless and vitest criteria pass; browser run done on a scratch worktree with the integration patch; real-tree integration pending plan 039.
- 2026-10-17 — `depends: [042]` dropped: the only thing 043 needs from 042 is `VesselState.sas` as plain data, which is committed and round-trips (resume test, SAS hold); 042's pending flight-page integration is independent of the save work. docs:check refuses an in-progress plan with an in-progress dependency.
- 2026-10-17 — Integration into the flight page, flight loop, HUD controller, pause menu, help overlay and main menu done on top of plans 039 and 042; manual run repeated on the real tree. done.

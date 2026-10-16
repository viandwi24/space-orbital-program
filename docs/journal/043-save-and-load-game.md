# 043 — Save and load game

**Plan:** plans/043-save-and-load-game.md · **Session(s):** save session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0050](../decisions/0050-save-format-and-resume.md) · **Status:** in progress: library, sim and format done; flight page, flight loop and main menu integration waits for plan 039.

## What was done

| Where | What |
|---|---|
| `packages/core/src/save.ts` | `SimSave` type and schema, `SIM_SAVE_FORMAT`/`SIM_SAVE_VERSION`, `hashText` (cyrb53) and `simSaveChecksum`, `readSimSave`/`parseSimSave` (marker, version, checksum of the file's own bytes, migration chain `SIM_SAVE_MIGRATIONS`, schema, re-sign after migration), `SaveError` with a `code`. API 0.1.12 |
| `packages/sim/src/save.ts`, `sim.ts`, `frames.ts` | `Sim.save()`, `createSim({ resume })`, `writeSave`/`restoreWorld`/`restoreFrames`; `createVesselBody` takes the saved mass properties; hand-written checks of the `sim.vessel` and `sim.part` components (sim has no zod dependency) |
| `apps/web/src/lib/save/` | `game-save.ts` (envelope, summary, `resumeInfo`, mod comparison), `store.ts`/`store-idb.ts` (memory and IndexedDB, own database `orbital-saves`, meta and data in one transaction), `saves.ts` (manager: quick, 3 rotating autosaves, named, rename, delete, export/import), `autosave.ts`, `thumbnail.ts`, `save-controller.svelte.ts`, `LoadDialog.svelte`, `SaveDialog.svelte`, `worker-save.ts` |
| `messages.ts`, `sim-client.ts`, `sim.worker.ts`, `sim-host.ts` | new message kinds `init` (boots the Worker, with an optional save), `save`, `saved`, `save-error`; `SimClient.save()`; `startSimWorker({ resume })`; two lines in the host ignore the two client kinds |
| `docs/journal/assets/043-integration.patch` | flight page (`?load=`, dialogs, autosave timer, stage and landing triggers, tab hidden, note), flight loop (F5/F9, `collectSave`, resume boot path), HUD controller (`resume` option), pause menu (Save, Load), help overlay, main menu (Load a flight) |

## Surprises

- **Rapier cannot be rebuilt bit for bit in ground contact.** Free flight, rails and staging resume byte for byte on the first try; the pad and landed cases differ. Cause: the contact solver warm-starts from impulses held inside Rapier; a rebuilt body starts cold, so a vessel at rest on a rotating tile jitters at about 3e-4 m/s in the other direction. Measured bound 1.3e-3, tested bound 5e-3, flat ground 4e-9. An unguided rocket lifting off after such a resume diverges exponentially (1 cm at 15 s, 0.8 m at 30 s), which is flight sensitivity, not a save bug. The human's rule was plain data, not `takeSnapshot`, so the tolerance is stated, not hidden (ADR 0050).
- **Near-equatorial orbital elements flip by pi** for a micrometre of position (`raan` and `argp`), so the tolerant comparison leaves `orbit` out and compares state vectors.
- A 0.3 mm/s nudge applied to the save did *not* reproduce the resume divergence (9 mm at 30 s, against 0.8 m): the difference is more than one velocity component, so I dropped that test rather than claim it as evidence.
- The `docs:check` rule "in-progress needs done dependencies" blocked `depends: [042]`; 042 is waiting for the same gate as this plan. The dependency was dropped (the save only needs `sas` as plain data, which is committed and tested).
- The dev autopilot (key `P`) assumes a fresh vessel and fires stage 0 first, so after resuming a mid-ascent save it staged at 2.4 km and went suborbital. Resuming from the pad and flying with the autopilot reached orbit.
- The `HudController` derived the part-entity to design-index map from the first snapshot, which is wrong for a vessel that already lost parts, and counted stages from events. A save therefore carries the launch design, and `resumeInfo` rebuilds the map from `PartState.index` and the stage count from `nextStage`.
- `F5` reloads the page unless the keydown is prevented; the flight loop prevents it only when no dialog is open.

## Verification

| Criterion | Evidence |
|---|---|
| Resume determinism | `bun test packages/sim/test/resume.test.ts`: 10 pass. Exact: mid-ascent, staging, orbital rails at 100x then burn, surface rails then wake, SAS hold; bounded 5e-3: pad (flat and terrain), landed on legs. Mutation checks: no angular velocity on restore: 5 of 10 fail; no warp: 3 fail |
| Migration and format | `packages/core/test/save.test.ts` (11) and `packages/sim/test/save-format.test.ts` (14, with the frozen fixture `save-v1.json`, 11 KB) |
| Web | `bunx vitest run src/lib/save`: 48 tests in 7 files |
| Browser | scratch worktree plus patch, built-in browser, port 5199: F5 mid-ascent (812 m), tab reload, "Load a flight" from the main menu: resumed at 1486 m with throttle 100 %, stage 1 fired, 12 s of flight carried over (`assets/043-load-screen.png`); pad quicksave on surface rails, reload, dev autopilot: periapsis 76.0 km, apoapsis 289.8 km (`assets/043-orbit-after-load.png`); named save "Two-stage in orbit" through the pause menu, reload: periapsis 76044.83 m and apoapsis 289846.38 m equal to the digits before, 100x warp advanced the clock, 1x resumed at 1 s per second |

The scratch worktree was removed afterwards; the dev server on port 5199 was stopped.

## For plans 044 and 046

- 044 (second body, SOI): `SimSave.body` is one root body; extend it to a body list (or the frames' reference body) with a version bump and a migration, keep `VesselState.soi` in the world, and add a resume test of a vessel on a moon's rails and one crossing the SOI.
- 046 (runtime mods): `SimSave.mods` holds id and version; the mod manager must supply `bootedMods()` (today `save/mods.ts` returns stock only) and resume refuses missing plugins by id. Mods must keep all state in the world (guide updated).
- Anything new in the sim (maneuver nodes in 045 included) goes into the world as components or into `SimSave` with a version bump; add it to `resume.test.ts`.

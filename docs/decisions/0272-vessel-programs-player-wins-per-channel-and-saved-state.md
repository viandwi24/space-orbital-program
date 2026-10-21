# 0272 — Vessel programs: the player wins per control channel, programs resume, and their state is saved

**Status:** accepted (owner's request, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/311-vessel-programs.md
**Builds on:** ADR 0271 (vessel-control API and mod autopilots), ADR 0232 (the script sandbox lives with the world), ADR 0201 point 9 (a vessel left behind keeps its scripts), ADR 0049 point 5 (input replaces SAS while held)
**Amends:** ADR 0020/0031 (one script per world; scripts are not saved), `core/src/save.ts` ("scripts are not saved")
**Research:** `research/vessel-programs.md`

## Context

The owner wants autonomous control to be a foundation: a script or a mod autopilot is attached to one vessel, keeps flying it when the player looks elsewhere, survives closing and reopening the world, and is listed in the Flight status bar. ADR 0271 adds mod autopilots that run inside the sim with JSON memory. Three things are still missing:

1. **Who wins.** Each vessel has one control setpoint and the last writer wins (`commands.ts`); nothing knows who wrote it. A script writes every tick and the player only on a key change, so the script nearly always wins and the player cannot take over. The only arbitration is the client's boolean dev autopilot.
2. **Saving.** Scripts are not saved; `worldSession.end()` stops them on every load, quickload and revert. One script runs per world.
3. **Seeing.** Script status reaches only the Flight panel and a sign outside Flight; there is no list of what is flying what.

The research (KSP stock SAS, kOS, MechJeb 2, kRPC, Juno, Space Engineers, Apollo DAP, Shuttle CSS, ArduPilot, PX4, Airbus, `twist_mux`) gives the same answers: arbitration is per axis; the human takes an axis while touching it and the program takes it back after a short quiet time; a change of who flies must never be silent; throttle is latched, not an axis; one owner per vessel; and every shipped game persists an explicit JSON state and restarts the program with it rather than snapshotting a VM.

## Decision

1. **A program** is whatever flies a vessel without the player: an engaged autopilot (ADR 0271) or a running player script. Both are attached to one vessel and recorded in that vessel's sim state, so they are in the snapshot and in the save. A vessel has at most one autopilot and at most one script; a script may engage an autopilot on its own vessel (ADR 0271 point 7), and both are then listed.
2. **Commands carry a source.** `CommandSource` becomes `'player' | 'script' | 'autopilot' | 'queued'`. The page sends `player`; the script host sends `script`; the ADR 0271 runner sends `autopilot`. `script` and `autopilot` are *program* sources.
3. **Control channels.** `pitch`, `yaw`, `roll`, `translateX`, `translateY`, `translateZ`, `throttle`, `wheelThrottle`. Each vessel has an `override` map: channel to the sim time until which program writes to it are ignored.
   - A `player` command that sets a channel to a non-zero value marks it **held** (`Infinity`). Setting it back to zero starts the **resume delay**: `override[ch] = t + PROGRAM_RESUME_DELAY` (1 s of sim time).
   - Throttle and wheel throttle are latched values: any `player` write to them sets `t + PROGRAM_RESUME_DELAY` (keys repeat the write while held, so it stays overridden while the key is down).
   - While a channel is overridden, a program command keeps its other channels and drops that one (no refusal; the command's verdict says `overridden: [channels]`). A program's SAS mode changes are not channels and still apply.
   - Overrides are only kept while the vessel has a program; they are cleared when the last program ends.
   This is MechJeb's per-axis yield and kOS raw control's "only the axes you set", with the `twist_mux` timeout and Apollo DAP's nudge-and-resume.
4. **Never silent.** The vessel snapshot carries `override` (the channels overridden now). The sim emits `program:override { vessel, channels }` when the set grows from empty and `program:resumed { vessel }` when it empties. The HUD shows a "Manual" badge with the channels; the programs list shows it per vessel.
5. **Kill switch.** Command `program-stop { vessel, reason? }` (source any) disengages the autopilot and ends the script of that vessel; the key **Delete** sends it for the active vessel, and **Abort** (Backspace) sends it before firing the Abort group. Like kOS `SUPPRESSAUTOPILOT` and the Airbus takeover button: one deliberate press, loud cue (`program:stopped` toast).
6. **Scripts are saved and resume.** `VesselState.script = { name, source, memory, resumed, startedAt }`:
   - `script-attach { vessel, name, source }` (on Run) and `script-detach { vessel, reason }` (Stop, finish, failure) are commands; a second attach on the same vessel replaces the first.
   - The script API gets a global `memory` (a plain object, JSON only, at most 64 KiB serialized) and `resumed` (boolean). The script host commits `memory` with `script-memory { vessel, memory }` at most once a second and when the script ends; the sim stores it, so it is part of every save, quicksave and autosave.
   - When a world opens, the world session starts a runner for every vessel with a `script`, with `resumed: true` and the saved `memory`. The script runs from its first line; resuming is the script's job (a `memory.phase` switch, as kOS boot files, Space Engineers `Storage` and Screeps `Memory` do). No VM snapshot: it would bind saves to the QuickJS build and make the save an attack surface.
   - The source text is saved with the vessel (scripts are small; capped at 64 KiB), so a resumed script is the script that was running, not the panel's current text.
7. **The script stays with its vessel.** Its record is on the vessel, switching vessels does not stop it, and the list shows it under its vessel. One script still runs per world (ADR 0232's sandbox runs one Worker); a Run on another vessel replaces it. Several scripts at once is a later plan (draft 313); mod autopilots (ADR 0271) already run on any number of vessels.
8. **The programs list.** The snapshot already has `vessel.autopilot` (ADR 0271) and now `vessel.script` and `vessel.override`; the page derives `programs` from them. The Flight status strip shows a chip "Programs N" (hidden at 0) that opens a list: vessel, program, phase/status, manual badge, **Switch to** and **Stop**.
9. **Vessels outside physics.** A program's step still runs while its vessel is on rails; a command that needs physics wakes it as a player command does (`ensureFlight`). If no frame is free the command is refused and the program sees the refusal. Programs are paused (not stopped) while the world clock is paused.

## Alternatives considered

- **Program always wins** (kOS cooked steering, MechJeb throttle) — rejected: the player cannot save a vessel from a bad script without finding the Stop button.
- **Disengage on any input** (PX4, Tesla) — rejected as the default: a nudge would end a docking approach; kept as the explicit Delete key and Abort.
- **Additive input** (kRPC default, Airbus dual input) — rejected: sums are hard to predict and Airbus has to announce them.
- **Snapshot the QuickJS heap** (quickjs-wasi, OpenComputers/Eris) — rejected for now: needs another QuickJS build, ≥256 KiB per script, breaks on engine upgrades, unsafe on untrusted saves. Possible later as a cache next to `memory`.
- **Replay** (Temporal) — rejected: any script edit diverges.

## Consequences

- No save format change: `script` and `override` are optional vessel fields; old saves load with neither. The delay queue's entries and replay commands gain an optional `source`.
- The scripting guide documents `memory`, `resumed` and the phase pattern; the sample ascent script becomes resumable.
- A third-party autopilot gets the same arbitration for free, because the runner tags its commands.
- The dev autopilot in `flight-loop.ts` keeps its own boolean until it is ported to a stock autopilot (plan 311 out of scope).

# 0159 — Replays and challenges as files: a start save, timed commands and checkpoints; challenges scored locally

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [131](../plans/131-replays-and-challenges-as-files.md)
**Builds on:** ADR 0098 point 6 (challenges and replays), ADR 0094 point 5 (no backend: verifiable files), ADR 0050 (saves; resume equals uninterrupted except in ground contact, bound 5e-3)

## Context

A flight has to be shareable and checkable without a server. The sim runs fixed steps (`dt`) behind an accumulator, takes every input as a `Command`, and resumes exactly from a `SimSave` except while a body touches its ground tile. A browser host steps with uneven wall deltas (one per frame) and changes the warp by command.

## Decision

1. **A replay file** (`format: "orbital-replay"`, `formatVersion: 1`, core `replay.ts`): the API version and mods, the start `SimSave`, the commands with the sim time they were dispatched at (`{ t, command }`, accepted ones only), and checkpoints every 10 s of sim time plus one at the end: per vessel its id, mode, SOI, position and velocity (SOI frame), stage counter and part count. A hand-flown flight is a start save of a few kB (5.7 kB for the two-stage example on the pad) plus a few kB of commands and checkpoints; a flight a script or an autopilot steers carries its command every step (the headless ascent: 10 690 commands, 1.6 MB for 240 s), since a closed-loop controller's commands cannot be compressed without changing the flight.
2. **Recording** wraps `dispatch` (`recordReplay`, sim; the web host records the same way around its sim client): the start save is taken when recording starts, a command is logged with the sim time after it was accepted, checkpoints come from snapshots.
3. **Verifying re-simulates** (`verifyReplay`, sim): resume the start save, step fixed `dt` of sim time (the wall step divided by the warp) up to each command's time and dispatch it, and compare each checkpoint: discrete values exactly, numbers within 5e-3 (ADR 0050's bound, m and m/s) or 1e-6 of the value, whichever is larger (positions are body-centred, hundreds of km: 1e-6 is 0.6 m at 600 km, float rounding and not a flight). The first difference is the verdict, with the checkpoint time and the value. Cross-machine bit equality is not promised; checkpoints absorb the drift of warp chunking and ground contact.
4. **The verifier is a tool** (`tools/replay-verify`, Bun): `bun tools/replay-verify/verify.ts <file>` prints the verdict and exits non-zero on a mismatch; it boots the mods the file names from the stock and example plugins the repo has.
5. **A challenge file** (`format: "orbital-challenge"`, `formatVersion: 1`, core `challenge.ts`): id, title, description, the preset and rule values, an optional system (the site is the default Space Center; a site template is a later addition), the goal (a milestone id such as `orbit:stock.home`) and the score axes from `cost` (funds at launch), `mass` (wet mass at launch, kg), `time` (sim time from the first launch to the goal, s) and `dv-margin` (Δv left at the goal, m/s). Lower is better except `dv-margin`.
6. **Playing and scoring is local.** Importing a challenge creates a world from it and marks the world with the challenge id; when that world records the goal milestone, the page scores each axis (`scoreRun`) and appends it to the challenge's local history (browser storage, per player: best per axis and the list). No leaderboard (no backend).
7. **Ghosts** are drawn from a replay's checkpoints as a page overlay (the Network layer's approach, ADR 0158): the track in map view and the ghost's position at the current sim time, interpolated between checkpoints.

## Alternatives considered

- **Record every host step** (wall delta and warp) for bit equality — tens of thousands of numbers for a ten-minute flight at 60 frames per second, and still not equal across machines (ADR 0050).
- **Sign replays** — there is no key to trust without a server; re-simulation is the check.

## Consequences

- A replay is only as portable as its mods: the verifier refuses one whose mods it cannot boot.
- The sim gains no new command or snapshot field; `recordReplay` and `verifyReplay` are new sim exports, the replay and challenge schemas new core ones (file formats in the plan's Touches).

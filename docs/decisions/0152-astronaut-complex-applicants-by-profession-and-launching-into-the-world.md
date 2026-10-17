# 0152 — Astronaut Complex: applicants by profession, crew kept by launching into the world's newest save

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [108](../plans/108-astronaut-complex-and-crew-panel.md)
**Builds on:** ADR 0176 (roster, recruit cost, seats), ADR 0100 point 1 (a roster and flight log per world), ADR 0143 point 2 (the Hangar's launch flies in the active world), ADR 0118 (a page runs its own sim from the newest save), ADR 0150 (the launch choice)

## Context

The roster lives in the sim and in its saves (`SimSave.crew`). A flight started from the Hangar or the Launch screen starts a fresh sim from the world's info, so anyone hired before is not there and `load-vessel` refuses seats for them; the ledger and started missions are lost the same way. The sim has `crew-hire` by profession but no applicant pool and no dismiss.

## Decision

1. **Launch into the world.** When the active world has a save, a new flight from the Launch screen resumes the world's newest save and adds the new vessel with `load-vessel` (placement and crew from the launch choice); the vessels, roster, ledger and missions of the world carry on. A world without a save starts from its info, as before. This is what ADR 0143 point 2 meant by "flies in the active world".
2. **The Astronaut Complex runs the world.** `/astronauts` starts a sim from the newest save of the active world (or its info), as the Mission Center does (ADR 0118), and saves through the save controller after a change, so the next launch sees the roster.
3. **Applicants are the professions.** The sim draws a recruit's name and traits when hired (ADR 0176); the Applicants tab offers one hire per profession with its cost (20 days of salary when salaries are on). A pool of named applicants would need sim state; it is left out.
4. **Dismiss waits for the sim.** There is no command to let a member go; plan 108 files a contract request for `crew-dismiss { member }` (refunded nothing, status `lost`-like `retired` or removal decided by the base plan's owner). Until it lands the profile shows no Dismiss button.
5. **Seats at launch.** The Launch screen lists the available members from the same save and assigns them to the design's seats (pod by pod, by part index); the choice carries `crew` to `load-vessel`.
6. **The crew panel** shows each member aboard the focused vessel with an IVA or EVA chip and radio bars marked "no radio" until suit radios (121).

## Alternatives considered

- **Keep the roster in the world record** — rejected: the sim owns crew state (XP, status, conditions); a second copy would drift.
- **A fresh sim for every launch** (today) — rejected: it throws away every system of the career between flights.

## Consequences

- Flight page: a launch with a save resumes it and loads the new vessel; `FlightOptions.crew`.
- `/astronauts` route; Launch seats; crew panel chips; contract request `crew-dismiss`.

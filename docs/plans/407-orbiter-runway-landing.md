---
id: 407
title: "The orbiter flies from re-entry to a stop on the runway: approach guidance and a headless landing test"
status: done
owner: "Worker C"
depends: [361, 389]
phase: 8
created: 2026-10-24
updated: 2026-10-24
---

# 407 — The orbiter flies from re-entry to a stop on the runway

**Size:** L

## Goal

A headless test flies the Wayfarer orbiter from the end of its re-entry (about 30 km, a few hundred m/s) to a stop on the runway, all parts on. Doing it needs approach guidance that does not exist yet: heading to the runway, a glide slope, a flare and touchdown.

## Context

- Split from plan 389 (mission flight tests, part 2), which allowed it: "if the controller is large, it becomes its own plan".
- Plan 361 tested re-entry down to 30 km, and the roll-out from 90 m/s apart. Plan 389 measured the orbiter's glide: lift-to-drag 3.1 to 3.2 at about 8° of angle of attack and Mach 2.
- Open choice: a guidance autopilot in `mods/guidance` (usable by players: a "Land on the runway" mode) or a controller inside the test only. The first is more work and more value; decide when refining.

## Scope

**In:**
- An approach controller (heading, glide slope, flare, brakes on touchdown) and the test: re-entry end state to a stop on the level-1 runway, all parts on.

**Out:**
- Re-entry itself (plan 361). A landing at a site other than the runway.

## Steps

1. Refine: read how runways and sites are placed (`site` placements, the aircraft tests in `packages/sim/test/aeroplane.test.ts`) and choose the controller's home.
2. Write the controller and the test.

## Acceptance criteria

- [x] web vitest `mission-flights.test.ts`: the orbiter flies from re-entry to a stop on the runway, all parts on.
- [x] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [x] STATUS row, journal `docs/journal/407-orbiter-runway-landing.md`, an ADR if a guidance mode is added.

## Log

- 2026-10-24 — Drafted by Worker B, split from plan 389.
- 2026-10-24 — Worker C, first attempt (plan stays `draft`): a test-only controller is in `mission-flights.test.ts` as `it.skip` (heading to the aim point 350 m before the runway centre, found by standing the orbiter on the runway; a reference line, a vertical-speed command turned into an angle of attack, gear below 1.5 km, a flare, brakes and chute on touchdown). Findings from about ten runs (a run takes about 2 s): (1) from 30 km and Mach 2 the stack cannot hold a glide: at 700 m/s the path steepens to 26–30° and the real angle of attack falls to 3° though 22° is commanded (the aero restoring torque beats the RCS and the surfaces on SAS `direction`), so it arrives at the ground at 300 m/s and 150 m/s sink; (2) from 15 km and 350 m/s, 15° path and 45 km out it flies the whole approach, lowers the gear, flares at 90 m and touches down at 8 m/s sink and 147 m/s, stops with the brakes and chute, but 3 of 18 parts are lost in the touchdown and it lands 3 km short; shorter starts dive into the ground, longer ones (47–50 km) run out of speed (sink 20 m/s at 170 m/s: the orbiter is a brick below about 200 m/s, while the roll-out test starts at 90 m/s); (3) so a landing needs either more control authority at speed (a control-surface or elevon trim path for SAS `direction`) or a higher touchdown speed with a longer stopping distance than the 1 200 m runway. Decide between a guidance mode (ADR) and test-only after that.
- 2026-10-24 — Done (Worker C, ADR 0366): the orbiter had no control surface; three elevon pairs, the nose along the airflow, a gear that lowers below 200 m/s, a level-2 runway; the landing test (a test-only controller with the start found by shooting) passes with all 24 parts (journal 407).

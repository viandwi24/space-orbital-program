# 407 — The orbiter flies from re-entry to a stop on the runway

**Plan:** [plans/407-orbiter-runway-landing.md](../plans/407-orbiter-runway-landing.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0366](../decisions/0366-orbiter-elevons-and-runway-landing.md)

## What it took

The first attempt (a test-only controller, about ten runs) could not land: from Mach 2 the real angle of attack fell to 3° though 22° was commanded. The plan's choices were elevon size or authority, the centre of mass, a body flap. The answer was simpler: **the orbiter had no control surface at all**. Three pairs of `stock.control-surface` on the tail (an experiment through the test, then in the Wayfarer builder) and the real angle of attack followed the command (16° commanded, 15° flown at 666 m/s, a pull-out from a 30° dive at 11 km).

Three more findings on the way:
1. **Crab.** Pointing the nose at the runway in space made the nose differ from the airflow sideways; the sideslip made the airframe pitch up (the angle of attack 13°, 34°, 59° while 9° was commanded; the SAS error was 0.03 rad all the time: it did what it was told). The nose now follows the airflow's heading and turns at most 10° towards the line.
2. **The gear.** `deploySpeed` was 150 m/s and the orbiter touches down at 150 to 165: the gear stayed up and the orbiter slid. It is 200 now.
3. **The lateral drift.** The start heading drifted 2 km sideways over the first 150 s (the planet turns under a straight inertial path; the airframe turns by banking, which the controller does not fly). The start heading and range are found by shooting (two numbers, a Newton step on a finite-difference Jacobian, nine flights at most).

## Result

`mission-flights.test.ts`, "the orbiter flies from 30 km and Mach 2 to a stop on the runway": a flight of about 280 s, about 90 s of wall time with the shooting. Touchdown 475 m past the aim point, 7 m off the line, 5 m/s sink, 163 m/s; all 24 parts; gear down; stopped in 940 m (1.4 km from the aim). That is a level-2 runway (1 800 m): ADR 0366 decides it.

## Side effects

- The Wayfarer carries the elevons: the baked blueprint changed; stock and Sol rescaled still reach orbit. The Sol 1:1 design has one elevon pair (three cost about 100 m/s of an ascent with no margin); its propellant is unchanged.
- `mods/stock/test/__snapshots__/part-ids.test.ts.snap`: the gear's `deploySpeed`.

## Left

A player's "land on the runway" mode in Guidance needs lateral control (banked turns) first. The runway length for the orbiter is a decision of the Space Center's runway level (2), not enforced by the game.

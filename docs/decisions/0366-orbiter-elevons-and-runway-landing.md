# 0366 — The orbiter has elevons; it lands on a level-2 runway

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/407-orbiter-runway-landing.md
**Builds on:** ADR 0300 and plans 356, 361 (the orbiter and its re-entry), plan 388 (its glide)

## Context

The first attempt at a headless runway landing found the Wayfarer orbiter could not hold an angle of attack at speed: at 700 m/s it was commanded 22° and sat at 3°. The cause was not the controller. The orbiter had wings and a 90 kN·m reaction wheel but **no control surface**: the delta wings alone hold the nose where the airflow puts it, and the wheel cannot turn the 70 t vessel against that torque. A second cause hid behind it: steering the nose at the runway's position in space, not along the airflow, made the vessel crab, and the airframe answered sideslip by pitching up (34°, then 59° of angle of attack at 180 m/s).

## Decision

1. **The orbiter carries elevons.** Three pairs of `stock.control-surface` on the tail section, on both sides, in the Wayfarer builder (`missions.ts`). The mixer drives them from SAS and the attitude demand like any control surface. The Sol 1:1 design carries one pair: the extra drag of three took about 100 m/s off an ascent that has no margin (ADR 0365).
2. **Its landing gear lowers below 200 m/s** (it was 150). The orbiter comes in at about 150 to 165 m/s with its wing loading, and the gear could not be lowered at touchdown speed.
3. **The runway for the orbiter is level 2 (1 800 m).** It touches down about 500 m past the aim point and stops in about 1.4 km with brakes and the drag chute; a level-1 runway (1 200 m) is too short for a 160 m/s landing (the roll-out test from 90 m/s needed under 1 200 m; the energy goes with the square of the speed). `mission-flights.test.ts` holds the landing to the level-2 runway.
4. **A test-only approach controller, with the start found by shooting.** It is in `mission-flights.test.ts`, not a Guidance mode: it steers by the angle of attack (a vertical-speed command), keeps the nose along the airflow, turns it towards the runway line by at most 10°, lowers the gear, preflares and flares by following the height with a sink rate (a 10 s time constant), then brakes and the chute. The airframe turns by banking, which the controller does not fly, so the start heading and the start range are found by Newton shooting over the deterministic flight (nine flights at most). A player's "land on the runway" mode would need the lateral control first; it is not part of this ADR.

## Consequences

- The orbiter holds its glide angle of attack at Mach 2 and flies the whole approach, with all 24 parts after the touchdown (6 m/s sink, the gear's tolerance is 14).
- The baked Wayfarer changes (the elevons); the stock, Sol rescaled and Sol 1:1 flights still reach orbit (`blueprint-systems.test.ts`); the part snapshot records the gear speed.

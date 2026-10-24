# 287 — More blueprints: the lunar rover mission and the other famous rockets

**Plan:** [plans/287-real-rocket-blueprints-waves-2-and-3.md](../plans/287-real-rocket-blueprints-waves-2-and-3.md) · **Session:** Worker C, 2026-10-24 · **ADRs:** 0263, 0268, 0316, 0317 (no new ADR)

## What was done

Twelve stock blueprints (ADR 0316: builders in `apps/web/src/lib/editor/missions.ts`, baked into `mods/stock/src/blueprints.generated.ts`), each with an English name (ADR 0268) and a row in `EXPECTED` of `blueprint-systems.test.ts`. The first two (wave 1) and the ten of this round:

| Blueprint | Tracker | What it is | Flight (stock / Sol rescaled / Sol 1:1) |
|---|---|---|---|
| Companion-1 | BP-05 | a probe with four whip antennas on the light launcher | goal / goal / short |
| Semyorka-S + Union | BP-03 | a 3-seat capsule under an escape tower, a service module, two stages, four liquid strap-ons | goal / goal / short |
| Kestrel 9 + Wyvern | BP-07 | a capsule with heat shield and a solar trunk on the two-stage real launcher | goal / goal / goal |
| Kestrel Heavy | BP-08 | a comsat on the Kestrel 9 with two more first stages strapped on | goal / goal / goal |
| Hercules V + Kentauros | BP-09 | a comsat on a wide upper stage over the real first stage with two solids | goal / goal / goal |
| Neutron-M + Breeze | BP-06 | a comsat on its own upper stage over the three-stage launcher | goal / goal / goal |
| Lumière 5 | BP-11 | a comsat on the real first stage between two big solids | goal / goal / goal |
| Semyorka-V + Orient-1 | BP-04 | a sphere capsule on an instrument module on the Union's strap-on rocket | goal / goal / short |
| Long Road 2F + Divine Vessel | BP-10 | an orbital module over a descent and service module on four strap-ons | goal / short / short |
| Dioscuri + Giant II | BP-13 | a descent module and an adapter module on a two-stage launcher with two solids | goal / goal / short |
| Hermes-R | BP-12 | a capsule with an escape tower on one stage: a hop over the edge of space | goal (apogee over the air) in all three |
| Selene Rover | BP-16 | a one-seat lander with a rover on its flank | `ground`; `mission-flights.test.ts` sets it down on the moon, releases the rover and drives 100 m |

A new blueprint goal, `suborbital` (core `BLUEPRINT_GOALS`, the Library's label), is for Hermes-R: the harness flies a straight hop under SAS hold and expects an apogee above the air. The orbital ones fly the Guidance ascent as before.

## Fixes found on the way

- `missions.test.ts` (the mission set, the size mismatches, RCS with monopropellant, every engine in a stage) had not been run with wave 1: Semyorka-S + Union had a 1.25 m engine under a 2.5 m tank, so its service engine is now the wide one, and the tests list the twelve.
- The 1.875 m capsules (Lantern) go to the 2.5 m launcher through the 1.875 to 2.5 m adapter; a 0.625 m top (command pod, orbital module) takes no escape tower, which is 1.25 m (the pod-3 does).

## Left

Nothing of the plan. The tracker's BP rows are done (`refs/part-visuals-and-blueprints/parts-tracker.md` §9).

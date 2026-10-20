# 260 — Part controls that need sim support

**Plan:** [plans/260-part-controls-sim-support.md](../plans/260-part-controls-sim-support.md) · **Session:** Worker C, 2026-10-21 · **ADRs:** [0242](../decisions/0242-wheel-motors-sas-level-and-taking-samples.md)

## What was done

| Control | Where | What |
|---|---|---|
| wheel motor | `mods/stock/src/modules.ts`, `core` `WheelSpec.drive`, `sim/frames.ts` | `setMotor`, `setMotorLimit`, `setReverse` on `stock.wheel` (off by default), charge draw by throttle × limit, a drive force along the wheel at the contact; the `stock.motors` group. Wheel parts carry `driveForce` 4000 N and `driveCharge` 0.3 EC/s |
| SAS level | `core` `ModuleDefinition.sasLevel`, `sim/sas.ts`, `commands.ts` | `stock.command` has `sasLevel` (default 3); the `sas` command refuses a mode above the vessel's best level with the reason; the Hangar's build settings write it; the pod's inspector shows "SAS level" |
| Take (EVA) | `core` `crew-take` and `takeSample`, `sim/eva.ts`, experiment module, `CrewPanel` | a suit within 3 m of a part that holds a sample takes it; boarding brings it aboard; the crew panel offers "Take sample · <part>" |

Tests: `wheel-motor.test.ts` (drives with the motor on, not off; reverse; a lower limit drives less), `sas-level.test.ts` (levels 0, 1 and full), `crew-take.test.ts` (refuse, take, run again, board), `take-sample.test.ts` (the nearest part in reach), stock `modules.test.ts`; the part-id snapshot changed (wheel config, `ModuleCommand` config).

## Notes

- The motor is off by default: the plane tests are untouched.
- The SAS level changes nothing for stock parts (all give 3); it is a build setting for now. Crew level could raise it later.

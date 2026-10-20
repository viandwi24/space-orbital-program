# 0242 — Wheel motors, a SAS level on control parts, and taking a sample on EVA

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/260-part-controls-sim-support.md
**Builds on:** ADR 0161 (wheels), ADR 0049 (SAS), ADR 0120 (EVA), ADR 0174 (part action descriptors)

## Context

Three part controls of the design (§7.6b) had no sim behind them: a wheel motor, an assist level on command parts, and "Take (EVA)" for experiments.

## Decision

1. **Wheel motor.** `WheelSpec.drive` is a force along the wheel's rolling direction at full throttle, N (signed). `stock.wheel` has `driveForce` and `driveCharge` in its config and `motor`, `motorLimit` and `reverse` in its state; the motor is **off until switched on**, so a plane's wheels are unchanged. With it on, the vessel throttle drives the wheel (the engine need not be lit), the module draws electric charge in proportion to throttle × limit, and a wheel that gets less than it asked for drives less. The brakes cancel the drive. The `stock.motors` group switches all motors.
2. **SAS level.** `ModuleDefinition.sasLevel(config)` gives 0 (hold, level), 1 (+ prograde, retrograde), 2 (+ normal, antinormal, radial) or 3 (+ maneuver, target, anti-target); the vessel has its best control source's level and the `sas` command refuses a mode above it with the reason. `stock.command` has `sasLevel` in its config, default 3, so no stock part changes; the Hangar's build settings can lower it (a Hardcore design constraint). Pilot level does not raise it yet.
3. **Taking a sample.** `ModuleDefinition.takeSample(ctx)` lets a part give up what it holds; the experiment module returns its held sample and becomes ready again. The command `crew-take { suit, vessel, part }` needs a suit with crew within `EVA_TAKE_RANGE` (3 m) of the part; the sample goes into the suit's locker and `crew-board` carries it to the vessel's locker. The flight's crew panel offers "Take sample · <part>" when one is within reach.

## Consequences

- `ModuleCommand` now has a config (`[ModuleCommand, {}]` in parts); the part snapshot shows the empty config.
- The 100-part action snapshot grew again (a motor switch, limit and reverse per wheel part are not in that test's mix).
- A wheel with its motor on and no charge drives nothing: the vehicle needs power.

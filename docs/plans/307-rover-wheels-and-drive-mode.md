---
id: 307
title: "Rover: wheels in three sizes, a chassis, drive mode and a rover blueprint"
status: done
owner: "part visuals session (Claude)"
depends: [303, 306]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 307 — Rover: wheels, chassis, drive mode, blueprint

## Goal

A rover that looks and drives like one: rover wheels in three sizes with motors and steering, a chassis to hang them on, a Flight drive mode (W/S drive forward and back, A/D steer, B brakes) and a rover blueprint among the famous missions.

## Context

- Plan 283 (the full rover plan: suspension, seat, scanning arms, drill) stays the umbrella; this plan delivers its first slice.
- ADR 0161 (wheels are colliders with tyre forces), plan 260 (wheel motors on the vessel throttle).
- Owner: rocket parts first, rovers next, robotics last; famous missions include a rover.

## Scope

**In:**
- the sim's wheel throttle (`wheel-throttle` command, -1..1, drives the motors forward or back, overriding the vessel throttle while non-zero);
- rover wheels S/M/L (fixed and steering) with a `rover-wheel` generator;
- a rover chassis part;
- Flight drive mode (a toggle key, on by default for a landed vessel with motor wheels);
- the Trailblazer Rover blueprint;
- tests.

**Out:** suspension springs, the external seat, scanning arms and the drill remodel (plan 283).

## Steps

1. Sim: `ControlState.wheelThrottle`, the `wheel-throttle` command, `stepWheels` drive from it, `WheelSpec.topSpeed`.
2. Parts and generator.
3. Flight drive mode: Alt+G, W/S to the wheel throttle (pitch held at 0), A/D steer as yaw, a Drive chip.
4. Blueprint and tests.

## Acceptance criteria

- [x] Sim test: a rover on the ground drives forward with wheel throttle 1 and backward with -1.
- [x] The stock part tests pass with the new parts.
- [x] The Trailblazer Rover blueprint builds and passes the mission checks.

## Docs checklist

- [x] `docs/STATUS.md`, journal `307-rover-wheels-and-drive-mode.md`.

## Log

- 2026-10-21 — Started after plans 306 and 308.
- 2026-10-21 — Done. Wheels got a top speed: 4 × 7 kN on a 1 t rover reached 21 m/s² and crashed in 2 s. A headless test drives the blueprint off the pad (`apps/web/src/lib/editor/mission-flights.test.ts`).

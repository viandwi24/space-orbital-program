---
id: 260
title: "Part controls that need sim support: Take (EVA) from an experiment, a wheel motor, a pod SAS level"
status: done
owner: "Worker C"
depends: [254]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 260 — Part controls that need sim support

**Size:** M

## Goal

The three controls plans 241 and 254 left because each needs a new sim feature, not a module field or a panel.

## Context

- **Take (EVA) from an experiment:** a crew member walks to the part and takes its sample into the suit; the suit's samples then come aboard at a hatch (`eva.ts` already credits a suit's held samples on boarding). Missing: a command and a walk-to-part rule, and the experiment's `sample` handed to the suit.
- **Wheel motor on/off and limit:** wheels are passive (rolling resistance, grip, brakes, steering). A motor needs a drive force along the rolling direction, an electric charge draw, and a throttle-like input from the vessel (`ship.throttle` or the pilot's forward key).
- **Pod SAS level:** the SAS mode set has no level. It needs a rule for what a level changes (which modes, how much torque the pod adds).

## Scope

**In:** the three controls above with their sim support and unit tests. **Out:** new part types.

## Touches

`packages/sim/src/{eva,vessel-api}.ts`, `mods/stock/src/{science,modules}.ts`, `apps/web/src/lib/inspector/*`.

## Steps

1. Refine each against main; an ADR for the wheel drive and the SAS level.
2. Implement with unit tests; the e2e when it is turned back on.

## Acceptance criteria

- [x] Each of the three controls works; unit tests pass.
- [x] Merged with typecheck and unit tests green. (e2e paused by the owner)

## Docs checklist

- [x] STATUS row, journal `docs/journal/260-part-controls-sim-support.md`.

## Log

- 2026-10-20 — Created by Worker C while finishing plan 254, for what that plan could not do without new sim support.
- 2026-10-21 — Done by Worker C: ADR 0242 and journal 260. The wheel motor and the SAS level are module and sim features; Take sample is a suit command with a crew-panel button.

---
id: 254
title: "Part controls, the rest: crew transfer in the pod inspector, Set as target on a docking port, Take (EVA) for experiments, a wheel motor, a pod SAS level, the RCS navball mark"
status: draft
owner: "Worker C"
depends: [241]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 254 — Part controls, the rest

**Size:** M

## Goal

The controls plan 241 left because each needs new sim or UI support, not a module field.

## Context

- Plan 241 added reaction wheel mode, the decoupler's staging switch, wheel steering on/off and invert, the RCS and Batteries groups, the parachute spread, the control surface deploy and the RCS build settings.
- Left, each with the reason:
  - **Crew transfer in the pod inspector:** the `crew-transfer` command exists (`packages/core/src/protocol.ts`); no UI uses it.
  - **Set as target on a docking port:** a part action cannot issue a sim command; it needs a `target-set` from the inspector, and the inspector shows only the player's own vessel.
  - **Take (EVA) on an experiment:** a crew member must walk to the part; needs the EVA plan 225's walk-to-part.
  - **Wheel motor on/off and limit:** wheels are passive (rolling, grip, brakes, steer): there is no drive force to switch.
  - **Pod SAS level:** the SAS mode set has no level; it needs a rule for what a level changes.
  - **RCS navball mark:** the navball has no RCS state.

## Scope

**In:** the six items above. **Out:** seat-by-seat crew placement in the Hangar.

## Touches

`apps/web/src/lib/inspector/*`, `packages/sim/src` (a drive force for wheels), `mods/stock/src/{modules,science,docking}.ts`, `apps/web/src/lib/navball*`.

## Steps

1. Refine each item against main; ADR for the wheel drive and the SAS level.
2. Implement with unit tests; e2e once it is turned back on.

## Acceptance criteria

- [ ] Each of the six controls exists and works; unit tests pass.
- [ ] CI is green.

## Docs checklist

- [ ] STATUS row, journal `docs/journal/254-part-controls-followups.md`.

## Log

- 2026-10-20 — Created by Worker C while finishing plan 241, for the items that plan could not do without new sim or UI support.

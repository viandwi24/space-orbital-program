---
id: 360
title: "Guidance autostage drops spent boosters (MechJeb-style), never crew or a burning engine"
status: done
owner: "rendezvous session (Claude)"
depends: [321, 356]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 360 — Guidance autostage drops spent boosters

## Goal

The Guidance Computer's autostage drops burnt-out solid boosters (and liquid boosters with empty tanks) as soon as they are spent, as MechJeb's autostage does, and never drops crew, a burning engine or the last engine.

## Context

- Report from the parts session (plan 356): empty SRBs rode to orbit on the Wayfarer Shuttle and Kronos V. `autoStage` looked for `ignited && flameout`, but stock's engine clears `ignited` when it flames out, so it never fired while another engine burned.

## Scope

**In:** `PilotFacts.nextStage` / `VesselPilot.nextStage` (what the next stage drops and lights, from the sim), the guarded `autoStage`, tests.
**Out:** dropping the Wayfarer's external tank at main engine cut-off (a design decision the autopilot cannot see; the player stages it).

## Acceptance criteria

- [x] `bun test mods/guidance`: a burnt-out booster beside a burning core is staged 0.5 s later; never when the stage drops crew, a burning engine, or holds no decoupler for the booster; nothing burning stages only when the next stage lights an engine; never past the last stage.
- [x] web vitest `mission-flights`: the Wayfarer under Guidance drops its SRBs within 3 s of burnout (0.6 s) and reaches a periapsis above 70 km without them (the tank staged at cut-off as the player would).

## Docs checklist

- [x] `docs/STATUS.md` board row.
- [x] `docs/journal/360-guidance-autostage-spent-boosters.md`.
- [x] Guide: `nextStage` and the ascent's autostage.

## Log

- 2026-10-22 — Done. `bun test mods/guidance packages/core/test/vessel-pilot.test.ts packages/sim/test/autopilot.test.ts`: 45 pass (plus 4 autostage tests); web vitest mission-flights: 8 pass.

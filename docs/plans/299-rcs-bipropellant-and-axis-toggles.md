---
id: 299
title: "RCS follow-ups: a bipropellant (LF+Ox) thruster and pitch, yaw and roll toggles"
status: done
owner: "Worker C"
depends: [277]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 299 — RCS follow-ups: bipropellant thruster and axis toggles

## Goal

A large thruster that burns liquid fuel and oxidizer (KSP's Vernor kind, 12 kN), and per-part toggles for pitch, yaw, roll and each translation axis, as KSP offers.

## Context

- Plan 277 (journal 277): the RCS family; these two were left out because both need sim work.
- `mods/stock/src/rcs.ts`: `ModuleRcs` burns one `propellant`; `nozzleFractions` gets the torque demand in the part frame, so a vessel-axis toggle needs the vessel's axes in the part frame.

## Scope

**In:** `propellants` (a mix) on `ModuleRcs`, additive; the part; axis toggles with a vessel-frame mask.
**Out:** —

## Design notes

Use the engine's propellant mix code for the flow. For the axes, pass the vessel's up and forward axes in the part frame (as the gimbal does), project the demand, and mask the components.

## Steps

1. Propellant mix in the module, with tests.
2. Axis toggles, with a test where roll off gives zero roll torque.
3. The part, its generator settings (a larger bronze bell), the tech node.

## Acceptance criteria

- [x] With roll disabled, a roll command gives zero RCS torque (module test with a four-block ring; pitch still works, and a pitch switch gives none).
- [x] The bipropellant thruster draws LF and Ox at 9:11 by volume and the right mass for 3 kN at Isp 290 s (module test).
- [x] `bun run lint`, `bun run typecheck`, `bun run test`, web vitest with `CI=true` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/299-rcs-bipropellant-and-axis-toggles.md` written.
- [x] Affected `docs/architecture/*.md` updated to match what shipped.
- [x] New ADRs written for any decision made here, linked above.
- [x] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: audited, still valid (`ModuleRcs` burns one `propellant`; it has rotation and translation toggles but no per-axis ones).
- 2026-10-21 — Split out of plan 277.
- 2026-10-24 — Done by Worker C. `ModuleRcs` takes `propellants` (a mix; `propellant` stays for one resource) and flows it with the engines' `propellantRates`; six axis switches (pitch, yaw, roll, sideways, forward/back, up/down) with Hangar build keys; `VesselApi.torqueDemandMasked` and `translateDemandMasked` mask the vessel's axes before the demand is turned into the part frame, so a turned block masks the right axis (SAS authority masks per part-frame component, which is exact for unturned blocks). New part `stock.rcs-bipropellant` (12 kN in four nozzles, Isp 290/120 s, 9 : 11 LF : Ox) in the RCS tech node. The bronze bell is the existing rcs-block model in a larger bronze palette.

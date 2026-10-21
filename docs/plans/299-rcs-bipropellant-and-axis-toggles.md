---
id: 299
title: "RCS follow-ups: a bipropellant (LF+Ox) thruster and pitch, yaw and roll toggles"
status: draft
owner: ""
depends: [277]
phase: 0
created: 2026-10-21
updated: 2026-10-21
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

- [ ] With roll disabled on all blocks, a roll command gives zero RCS torque (sim test).
- [ ] The bipropellant thruster draws LF and Ox at 9:11 (sim test).
- [ ] `bun run lint`, `bun run typecheck`, `bun run test`, web vitest with `CI=true` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/299-rcs-bipropellant-and-axis-toggles.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-21 — Split out of plan 277.

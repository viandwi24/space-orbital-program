---
id: 014
title: Re-entry heating and part temperature
status: draft
owner: ""
depends: [012]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 014 — Re-entry heating and part temperature

## Goal

A vessel that enters the atmosphere fast heats up: parts have a temperature that rises with air density times speed cubed and falls by radiation, and a part that exceeds its limit is lost the same way an impact loses it (break-off, destroyed). Plan 007 and plan 012 deliberately simulate no heat; the lander of plan 012 reaches 700 m/s in the dense atmosphere unharmed.

## Context

- Read: `docs/decisions/0019-ground-tile-and-impact-damage.md` ("re-entry survival hooks": `PartDefinition.impactTolerance` and the `part:damaged` event are the pattern), `docs/architecture/simulation.md` (drag, atmosphere), `packages/sim/src/aero.ts`, `packages/sim/src/vessel.ts` (`damagePart`).
- Open questions: where temperature state lives (module state on the part vs a sim component), heat shield as a module (ablator resource), whether the damage outcome vocabulary (`broken` / `destroyed`) needs an `overheated` cause on `part:damaged`.

## Scope

**In:** per-part temperature, convective heating from the existing drag state, a `maxTemperature` part field, a heat-shield module through the SDK, reuse of `damagePart`.
**Out:** plasma blackout, radiative environments, per-face heating.

## Steps

1. Refine (research atmosphere heating models, ADR, measurable criteria such as "the plan 012 lander without a shield loses its pod on a 100 km deorbit, with one it lands").

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, `simulation.md`, ADR.

## Log

- 2026-10-16 — Created as draft by plan 012 (re-entry heating is out of scope there; its hooks are `impactTolerance` and `part:damaged`).

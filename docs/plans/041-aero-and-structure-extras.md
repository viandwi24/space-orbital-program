---
id: 041
title: "Aero and structure extras: struts, fuel lines, tilted parts, wing lift"
status: draft
owner: ""
depends: [033]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 041 — Aero and structure extras

## Goal

The building blocks plan 033 did not add: struts and fuel lines (crossfeed between radial parts), tilted parts (engine direction in the descriptor), non-cylindrical radial parents, and wing lift for planes.

## Context

- Read: ADRs 0016, 0017, 0033, 0034, 0035, 0042, 0045, 0046; journal 026 and 033; `docs/research/fin-aerodynamics.md`.

## Scope

**In (candidates, to be ordered at refinement), each with the reason it was not in 033:**
1. **Struts and fuel lines**: crossfeed between radial parts changes the resource graph (ADR 0015 `flowMode`) and the Δv model (`delta-v.ts`); one ADR.
2. **Tilted parts**: the design format only has yaw about +Y (ADR 0034); full rotation changes the format, the sim's assembly, the Δv descriptor (engine direction) and the editor; one ADR and a format version.
3. **Non-cylindrical radial parents**: the radial link is defined on cylinders (ADR 0034); boxes need a surface parametrisation.
4. **Wing lift for planes**: a wing is a lifting surface with an incidence and an aspect-ratio model; `stock.fin` and `stock.control-surface` are the base (ADR 0035, 0045), but a plane needs a flight-model review (ground handling, stall, trim) and the stability read-out for it (ADR 0042).

## Steps

1. Refine: pick and order, one ADR each.

## Acceptance criteria

- [ ] To be written at refinement.

## Docs checklist

- [ ] STATUS, journal, ADRs, architecture docs.

## Log

- 2026-10-17 — Created as draft by the control session (pushed out of plan 033).

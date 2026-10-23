---
id: 407
title: "The orbiter flies from re-entry to a stop on the runway: approach guidance and a headless landing test"
status: draft
owner: ""
depends: [361, 389]
phase: 8
created: 2026-10-24
updated: 2026-10-24
---

# 407 — The orbiter flies from re-entry to a stop on the runway

**Size:** L

## Goal

A headless test flies the Wayfarer orbiter from the end of its re-entry (about 30 km, a few hundred m/s) to a stop on the runway, all parts on. Doing it needs approach guidance that does not exist yet: heading to the runway, a glide slope, a flare and touchdown.

## Context

- Split from plan 389 (mission flight tests, part 2), which allowed it: "if the controller is large, it becomes its own plan".
- Plan 361 tested re-entry down to 30 km, and the roll-out from 90 m/s apart. Plan 389 measured the orbiter's glide: lift-to-drag 3.1 to 3.2 at about 8° of angle of attack and Mach 2.
- Open choice: a guidance autopilot in `mods/guidance` (usable by players: a "Land on the runway" mode) or a controller inside the test only. The first is more work and more value; decide when refining.

## Scope

**In:**
- An approach controller (heading, glide slope, flare, brakes on touchdown) and the test: re-entry end state to a stop on the level-1 runway, all parts on.

**Out:**
- Re-entry itself (plan 361). A landing at a site other than the runway.

## Steps

1. Refine: read how runways and sites are placed (`site` placements, the aircraft tests in `packages/sim/test/aeroplane.test.ts`) and choose the controller's home.
2. Write the controller and the test.

## Acceptance criteria

- [ ] web vitest `mission-flights.test.ts`: the orbiter flies from re-entry to a stop on the runway, all parts on.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] STATUS row, journal `docs/journal/407-orbiter-runway-landing.md`, an ADR if a guidance mode is added.

## Log

- 2026-10-24 — Drafted by Worker B, split from plan 389.

---
id: 309
title: "Headless flight tests for the mission blueprints: shuttle launch, capsule re-entry, lander landing, station docking, rover drive"
status: done
owner: "part visuals session (Claude)"
depends: [303, 307]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 309 — Mission flight tests

## Goal

Each famous-mission blueprint does in a headless sim what it is for, in short runs (owner: short tests, no e2e).

## Context

- Plan 303 (the blueprints), ADR 0263 point 5 (blueprints flown headless).

## Scope

**In:** `apps/web/src/lib/editor/mission-flights.test.ts`; fixes to the blueprints and parts the tests find.
**Out:** full ascents to orbit and full lunar trips (players' runs; the sim tests of plans 044 and 034 cover the method).

## Steps

1. Tests: rover drive (307), shuttle lift-off, capsule re-entry, lander landing, station docking. Pieces of a blueprint (the capsule, the lander) are cut out of it with `subtreeOf`.
2. Fix what fails.

## Acceptance criteria

- [x] Wayfarer Shuttle climbs above 2.5 km in 25 s under SAS, all 24 parts on.
- [x] The Kronos capsule enters at 60 km and 2 km/s, opens its chutes and touches down below 10 m/s, still a capsule.
- [x] The Selene lander comes down from 1.5 km on the moon on its descent engine, all parts on.
- [x] A ferry with a port closing at 0.25 m/s docks on Horizon Station's top port.
- [x] Trailblazer Rover drives more than 10 m in 8 s against the turning ground.

## Docs checklist

- [x] `docs/STATUS.md`, journal `309-mission-flight-tests.md`.

## Log

- 2026-10-21 — Done. Three bugs found and fixed:
  - the shuttle turned over;
  - the SRB-XL could not steer;
  - pod-3's reefed canopy had ten times the drag of the full one.

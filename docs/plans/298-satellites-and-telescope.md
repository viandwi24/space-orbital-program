---
id: 298
title: "Satellites and a space telescope: satellite bus, telescope tube with aperture door, sensor booms, high-gain arms, an orbiter probe bus"
status: draft
owner: ""
depends: [291, 280]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 298 — Satellites and a space telescope: satellite bus, telescope tube with aperture door, sensor booms, high-gain arms, an orbiter probe bus

## Goal

The "orbiter", "space telescope" and "research satellite" missions have their bodies: a foil-wrapped satellite bus (two sizes) with mount faces for solar wings and dishes, a telescope tube with a hinged aperture door, baffle rings and a rear instrument section, sensor booms (magnetometer), high-gain antennas on arms, and a planetary orbiter bus with its own engine; a telescope observation experiment so the telescope does something.

## Context

- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` (§11, missions and the parts they need).
- ADRs: 0257, 0259
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Generators and parts; `ExperimentObservation` (science from a target body or the sky while the door is open and the craft points at it); OrbitX titles.
**Out:** Asteroid discovery or a sky map.

## Design notes

The observation experiment reuses `ModuleExperiment` with a pointing condition (angle to the target under 5°) and the door state.

## Steps

1. Bus, telescope, booms, high-gain arm generators and parts.
2. Observation experiment with tests.
3. Headless test: a telescope in orbit, door open, pointed at the moon, yields science.

## Acceptance criteria

- [ ] Observation yields science only with the door open and the pointing within 5° (sim test).
- [ ] `bun run lint`, `bun run typecheck`, `bun run test` and the web vitest suite with `CI=true` pass; `bun run docs:check` passes.
- [ ] Catalogue icons and a Hangar screenshot of every new part in the journal.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/298-satellites-and-telescope.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers, and the mission table (§11).

## Log

- 2026-10-21 — Drafted from the owner's mission targets of 2026-10-21 (Apollo 11, Space Shuttle, station, rover, orbiter, space telescope, research satellite): rocket parts first, rover after, robotics last.

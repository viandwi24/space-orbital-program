---
id: 060
title: "Stones you can hit: collision for scenery stones"
status: draft
owner: ""
depends: [052]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 060 — Stones you can hit

## Goal

A lander's leg that comes down on a boulder rests on it (or the lander tips), instead of sinking into scenery.

## Context

- Found, not done, in plan 052 (ADR 0068 point 9): the stones are a pure function of a world-fixed lattice (`stones-model.ts`, renderer only) and have no collision; the sim's ground is the height field of `createBodyTerrainField` (a kinematic ground tile, ADR 0019, 0043). A boulder is up to 1.5 m across, a lander leg lands within a metre of its spot, so the case is real but rare.

## Scope

**In (to be ordered at refinement):** move the lattice and its hashes into `@orbital/core` (they are pure integer hashing already, so core and renderer share them); the sim adds colliders for the stones within some metres of a vessel in contact (a few boxes or spheres in the ground tile, rebuilt as the vessel moves), with the same rules for impact damage; the renderer keeps drawing from the same function.
**Out:** destructible or movable stones, stones on the home planet.

## Acceptance criteria

- [ ] To be made measurable at refinement (a lander placed over a known boulder rests at its top, the run is deterministic, resume stays byte-exact outside ground contact).

## Docs checklist

- [ ] STATUS, journal, ADR, `simulation.md`.

## Log

- 2026-10-17 — Created as draft by plan 052 (found, not done).

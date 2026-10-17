---
id: 067
title: "Floating, sinking and boats: buoyancy on the sea and on lakes"
status: draft
owner: ""
depends: [038]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 067 — Floating, sinking and boats

## Goal

A vessel that comes down on water (the sea, a lake) floats, tips or sinks according to its mass and the volume of its parts, instead of resting on the water's surface as on land. Plan 038 made lakes as solid as the sea (the height function is exactly zero on a lake floor); this plan replaces that solid surface by a water level the sim can displace.

## Context

- Pushed out of plan 038 (ADR 0072): the sim has no water at all (journal 031: "ocean is solid"; ADR 0019 puts a kinematic ground tile on the terrain height), so lakes needed no sim change, and a lake that sank vessels while the sea did not would have been inconsistent.
- Needed: where the water is (`isLake` in `packages/core/src/terrain.ts` and the biome map's sea level are the data; an `isWater(direction)` in core), a buoyancy force per part from its displaced volume (a part's `shape` gives the volume), drag in water, a "splashed down" event, and a landing-gear interaction with floating (`stock.landing-legs`).
- Read: ADR 0019, ADR 0043, ADR 0072, `docs/architecture/units-and-frames.md`, journal 012 and 031.

## Scope

**In (to be ordered at refinement):** water level in core (one function for sea and lakes); buoyancy and water drag in the sim's force sum; part volumes; the damage rule for an impact on water (a hard splashdown destroys parts as a hard landing does); a stock floating part (a flotation collar) so a capsule can bob; renderer: the vessel drawn at its waterline, ripples at the contact.

**Out:** waves that move the vessel (a sea state), boats with propellers, swimming kerbals.

## Acceptance criteria

- [ ] A capsule dropped on the sea floats with its CoM above the waterline at the ratio its mean density gives; a 25 t two-stage rocket sinks; a test in `packages/sim` per case with deterministic end state.
- [ ] The same on a lake (the home body's lakes: `isLake`).
- [ ] Impact damage on water follows the same rule as on ground with a lower factor; a test.
- [ ] `bun test`, typecheck, build, docs:check pass; the headless ascent still reaches orbit (no regression in flight).

## Docs checklist

- [ ] STATUS, journal, ADR (the force model), `docs/architecture` physics section.

## Log

- 2026-10-17 — Created as draft by plan 038 (ADR 0072: lakes are solid like the sea for now).

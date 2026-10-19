---
id: 234
title: "Deep-space dish: a large, realistic parabolic antenna building"
status: draft
owner: ""
depends: [233]
phase: 7
created: 2026-10-19
updated: 2026-10-19
---

# 234 — Deep-space dish: a large, realistic parabolic antenna building

## Goal

The Space Center can build a deep-space dish (`stock.deep-space-dish`) that looks like a real deep-space network antenna in the 34–70 m class. It slowly tracks the active vessel, or a sky target when no vessel is active, and it acts as the high-tier comms node. The existing small `stock.tracking-dish` stays as the early tier.

## Context

- Owner request, 2026-10-19: "a big parabola like in the films, an exact and realistic version". ADR 0222 point 3.
- Today, `stock.tracking-dish` is a 2 × 2 generic `gen('dish')` model (`mods/stock/src/buildings.ts:130-139`). Site building visuals are in `packages/renderer/src/site-buildings.ts`.
- Comms nodes and ground stations: ADRs 0101, 0185 and following; plans 114–121.
- Building data and placement: ADRs 0097, 0115, 0123.

## Scope

**In:**
- The building definition: size about 8 × 8 cells; three levels that set range and data rate; cost, build days and upkeep on the scale of a top-tier building.
- A procedural model with:
  - a concrete pedestal and a stair tower;
  - a turntable alidade with an elevation bull gear;
  - a parabolic reflector (panel rings with seams) and a back-up truss;
  - a quadripod;
  - a hyperbolic subreflector and a feed cone;
  - a cable wrap;
  - warning lights.
- LOD for distant views.
- Azimuth and elevation tracking, driven by the target direction (the sim provides it). Rates are slow and realistic. The dish parks in stow when idle.
- The dish is a comms node with high gain.

**Out:**
- The build menu (plan 235).
- Branches (plan 236).

## Touches

- **Size:** L
- **Edits:**
  - `mods/stock/src/buildings.ts`
  - `packages/renderer/src/site-buildings.ts`, or a new `packages/renderer/src/site/dish.ts`
  - comms node stats in `mods/stock/src/comms.ts`
- **Shared contracts:** none new; it uses the building and comms-node data.

## Steps

1. Write the reference geometry in the plan Log: dimensions taken from public descriptions of 34 m and 70 m DSN-class antennas, scaled.
2. Model generator with LOD; renderer unit tests for its bounds and node count.
3. Tracking: a pure function from target direction to azimuth and elevation with slew limits, with tests.
4. Building data and the comms node stats; a test that it raises the link budget compared with the tracking dish.
5. A Chromium e2e: use the debug API to build the dish at the Space Center, then take a screenshot from 4 angles at the Space Center.

## Acceptance criteria

- [ ] Renderer tests pass: the dish bounds stay within its footprint; the tracking function respects its slew limits and points within 0.5° at steady state.
- [ ] A sim or core test passes: a vessel at Moon distance links through the dish with a higher data rate than through the tracking dish.
- [ ] `e2e/deep-space-dish.e2e.ts` passes on Chromium, with 4 screenshots in the journal. `[manual]` The owner judges the realism.
- [ ] `bun run check:affected` passes, and CI is green on `ready/234`.

## Docs checklist

- [ ] STATUS, journal with screenshots, architecture notes on site buildings.

## Log

- 2026-10-19 — Created from the owner's manual test (ADR 0222).

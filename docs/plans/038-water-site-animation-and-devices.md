---
id: 038
title: "Lakes and rivers, launch-site animation, device measurements and mobile"
status: draft
owner: ""
depends: [031]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 038 — Lakes and rivers, launch-site animation, device measurements and mobile

## Goal

What plan 031 pushed out: lakes in lowland basins and rivers that flow, shore waves that break, a launch site with moving parts, frame times on the budget machines and a shader precompile with a loading indicator.

## Context

- Read: `docs/journal/031-physical-terrain-and-sky-volumes.md` ("Not done"), ADR 0037 (water), ADR 0044, `docs/product/visual-direction.md`.

## Scope

**In (candidates, to be ordered at refinement):**
1. Lakes (water below a basin level of the height function; needs a water level in the core field, so the sim can float or sink a vessel there) and river flow (moving ripples and foam along the level sets).
2. Shore waves that break on the coast gradient.
3. Launch site: steam from the tanks, swing arms that retract at liftoff, blinking beacons, glowing windows at night (the glTF asset swap belongs to plan 026's provider interface).
4. Devices: frame times on an Apple M1/M2 and an integrated Intel GPU and a real `selectPreset` tuning (the terrain march costs 9 ms of `high` in a ground-hugging view, journal 031); `compileAsync` precompile and a loading indicator (programs compiled after the first frame ran 3x slower in a hidden pane); mobile.
5. Analytic noise derivatives (cheaper gradient bakes); silhouette anti-aliasing of the planet pass.

**Out:** part models and effects (026, 033), HUD (021), VAB (022, 029).

## Steps

1. Refine with the human; one ADR per item that changes a boundary.

## Acceptance criteria

- [ ] To be written at refinement; visual items carry `[manual]` screenshots and a frame-time table.

## Docs checklist

- [ ] STATUS, journal, ADRs, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by the physical-terrain session (pushed out of plan 031).

---
id: 031
title: "Physical terrain heights, volumetric sky and site animation"
status: draft
owner: ""
depends: [027]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 031 — Physical terrain heights, volumetric sky and site animation

## Goal

What plan 027's self-review still names: a vessel that lands in the hills stands on the hills (the sim's ground follows the drawn terrain), clouds that have volume and light shafts, a launch site with moving parts, rivers that flow and lakes, and frame times on the budget machines.

## Context

- Read: `docs/journal/027-terrain-and-sky-follow-ups.md` (self-review, "Not done"), ADR 0036 (visual terrain, flat zones, the bubble), ADR 0037 (layers, haze, waves), ADR 0019 (ground tile), `docs/architecture/simulation.md`.

## Scope

**In (candidates, to be ordered at refinement):**
1. **Physical heights**: the sim's contact tile, surface rails, altitude and radar altitude read `terrainHeight` (the reference implementation in `packages/renderer/src/terrain-model.ts` has to move to an environment-neutral package, or be re-derived with a parity test against the GLSL bake to a few centimetres); the bubble of ADR 0036 is then deleted. Needs an ADR that changes ADR 0019, a protocol-compatible `createSim` option and determinism tests.
2. **Volumetric clouds and light shafts**: a half-resolution ray-marched cumulus slab with self-shadowing (ADR 0037 keeps a lit shell), crepuscular rays, aurora or ozone term for the golden hour.
3. **Water**: lakes in lowland basins, river flow along the level sets (moving ripples and foam), shore waves that break on the coast gradient.
4. **Launch site**: steam from the tanks, swing arms that retract at liftoff, blinking beacons, glowing windows at night; the glTF asset swap belongs to the provider interface of plan 026.
5. **Devices**: frame times on an Apple M1/M2 and an integrated Intel GPU and a real `selectPreset` tuning; a hidden-pane artefact (programs compiled after the first frame ran 3x slower in plan 027's measurements) needs a check in a visible window; shader precompile (`compileAsync`) and a loading indicator; analytic noise derivatives; mobile.
6. **Silhouette anti-aliasing** of the planet pass (the terrain edge is one sample per pixel).

**Out:** part models and effects (026), HUD (021), VAB (022/029).

## Steps

1. Refine with the human; one ADR per item that changes a boundary (item 1 changes ADR 0019).

## Acceptance criteria

- [ ] To be written at refinement; every visual item carries `[manual]` screenshots under `docs/journal/assets/` and a frame-time table.

## Docs checklist

- [ ] STATUS, journal, ADRs for boundary changes, `docs/research/three.md`, `docs/architecture/simulation.md` if the ground changes.

## Log

- 2026-10-17 — Created as draft by the terrain session (pushed out of plan 027).

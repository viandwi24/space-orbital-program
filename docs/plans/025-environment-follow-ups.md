---
id: 025
title: "Visual: environment follow-ups (terrain, vegetation, weather, launch-site coordinates, device tuning)"
status: draft
owner: ""
depends: [019]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 025 — Visual: environment follow-ups

## Goal

The flight environment of plan 019 stops falling short in the places its journal names: the ground between 1 and 20 km is a painted map, the near ground is noise colour, the launch site is generic, clouds are a single shell, and the launch site depends on a heuristic.

## Context

- Read: `docs/journal/019-flight-environment.md` (self-review, "Surprises"), ADR 0027, `docs/product/visual-direction.md`.

## Scope

**In (candidates, to be ordered at refinement):**
1. **Launch-site coordinates in the sim**: `placeOnSurface` should place at body-fixed latitude/longitude (or `load-vessel` should return/snapshot the site) so the renderer no longer infers it (ADR 0027 item 11). Needs an ADR and an API bump.
2. Terrain heights and LOD (Phase 3) to replace the flat reference sphere in rendering and physics.
3. Ground vegetation near the pad (instanced grass tufts, wind), coast foam and ocean waves, rivers, mountain relief with real height.
4. Weather and sky: layered or volumetric clouds, cirrus and haze, aurora/ozone term for a richer low sun.
5. Launch-site art: weathering, more buildings, animated details (steam, lights, swing arms), later asset swap (mesh providers).
6. Device tuning: frame times on an M1/M2 and an integrated Intel GPU; adjust `selectPreset` and the preset table; shader precompile and a loading indicator; mobile.

**Out:** part models and effects (020), HUD (021), VAB (022).

## Steps

1. Refine: pick and order the items above with the human; one ADR per item that changes a boundary.

## Acceptance criteria

- [ ] To be written at refinement; every visual item carries `[manual]` screenshots under `docs/journal/assets/` and a frame-time table.

## Docs checklist

- [ ] STATUS, journal, ADRs for boundary changes, `docs/research/three.md`.

## Log

- 2026-10-16 — Created as draft by the environment session (pushed out of plan 019).

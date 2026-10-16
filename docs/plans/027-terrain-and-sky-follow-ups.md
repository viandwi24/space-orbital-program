---
id: 027
title: "Visual: terrain geometry, sky and device follow-ups"
status: draft
owner: ""
depends: [025]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 027 — Visual: terrain geometry, sky and device follow-ups

## Goal

Close what plan 025's self-review still names: terrain that has silhouettes (mountains against the sky, hills against the horizon), skies with more than one cloud layer, a launch site with moving parts, and frame times on the budget machines.

## Context

- Read: `docs/journal/025-environment-follow-ups.md` (self-review, "Not done"), ADR 0030, ADR 0027, ADR 0019, `docs/product/visual-direction.md`.

## Scope

**In (candidates, to be ordered at refinement):**
1. **Terrain geometry and LOD**: a heightfield (clipmap or quadtree) under the analytic planet pass so relief has silhouettes, with the same height function in the sim's ground tile (ADR 0019 needs to change), trees and buildings placed on it.
2. **Sky**: layered clouds (cumulus plus cirrus), volumetric lighting, haze tuning at low altitude (desert and ocean look milky from 3-10 km), aurora or ozone term for a richer golden hour.
3. **Water**: waves and foam on a time uniform, rivers with flow, lakes.
4. **Launch site**: animated details (steam, swing arms retracting, lights blinking), more buildings, glTF asset swap through a provider interface.
5. **Device tuning**: frame times on an M1/M2 and an integrated Intel GPU; `selectPreset`; the ground shader's relief with analytic noise derivatives; shader precompile and a loading indicator; mobile.

**Out:** part models and effects (026), HUD (021), VAB (022).

## Steps

1. Refine with the human; one ADR per item that changes a boundary.

## Acceptance criteria

- [ ] To be written at refinement; every visual item carries `[manual]` screenshots under `docs/journal/assets/` and a frame-time table.

## Docs checklist

- [ ] STATUS, journal, ADRs for boundary changes, `docs/research/three.md`.

## Log

- 2026-10-16 — Created as draft by the environment-2 session (pushed out of plan 025).

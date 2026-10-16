---
id: 033
title: "Part follow-ups 2: asset provider, smoke, debris, plasma, device tuning, aero and radial extras"
status: draft
owner: ""
depends: [026]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 033 — Part follow-ups 2

## Goal

What plan 026 (radial parts, boosters, fins) left out on purpose, so that the parts and effects reach the visual bar of `product/visual-direction.md` and the building blocks players expect from a KSP-like game.

## Context

- Read: `docs/journal/026-part-visual-follow-ups.md` (self-review, "Not done"), ADR 0028, 0034, 0035, `docs/journal/020-part-models-and-effects.md`.

## Scope

**In (candidates, to be ordered at refinement):**
1. **Asset provider**: a `PartModelProvider` that loads glTF (`visual.kind: 'model'`, `params.url`) with the procedural generators as fallback; KTX2 textures; bundle and loading budget.
2. **Smoke and dust**: volumetric look lit by the sun, wind drift, terrain-dependent dust colour, water spray over the ocean, engine trail that persists in the air column; ground light cast by the plume.
3. **Debris**: shards from the real part meshes instead of boxes; wreckage that stays on the ground; booster stubs that tumble visibly.
4. **Plasma**: bow-shock shape from the vessel silhouette, ionisation colours with speed, comms blackout hook.
5. **Engine extras**: gimbal from the commanded attitude (finned rockets resist the reaction wheel, see journal 026), multi-nozzle engines, mach-diamond polish.
6. **Aero and radial extras**: control surfaces (commanded deflection), struts and fuel lines (crossfeed between radial parts), tilted parts (engine direction in the module descriptor), non-cylindrical radial parents, wing lift for planes, a proper aerodynamic damping term, a stability read-out in the VAB (centre of pressure against centre of mass).
7. **Device tuning**: frame times on an M1/M2 and an integrated Intel GPU for the part and effect budgets (the boosted vessel is 83 k triangles and 280 draw calls in the VAB); tune the presets; merge draw calls of repeated parts (instancing for symmetric copies).

**Out:** environment (027), HUD, VAB hangar polish (029).

## Steps

1. Refine with the human: pick and order the items; one ADR per item that changes a boundary.

## Acceptance criteria

- [ ] To be written at refinement; every visual item carries `[manual]` screenshots under `docs/journal/assets/` and a frame-time table.

## Docs checklist

- [ ] STATUS, journal, ADRs for boundary changes, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by the radial session (pushed out of plan 026).

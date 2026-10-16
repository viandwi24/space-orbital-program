---
id: 026
title: "Visual: part follow-ups (radial parts and fins, asset provider, effect polish, device tuning)"
status: draft
owner: ""
depends: [020]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 026 — Visual: part follow-ups

## Goal

The part models and effects of plan 020 stop falling short in the places its journal names: only stack parts exist (no boosters, fins or radial hardware), the models are procedural only, and a few effects are simpler than the references (smoke billows, the plasma bubble, engine start-up and shutdown, shadows of the plume on the ground).

## Context

- Read: `docs/journal/020-part-models-and-effects.md` (self-review, "Not done"), ADR 0028, `docs/product/visual-direction.md`.

## Scope

**In (candidates, to be ordered at refinement):**
1. **Radial parts**: surface attach nodes in the design format, radial boosters, fins, struts, radial decouplers, with generators (the tank generator already supports `fins`-style hardware in principle; no stock part uses it). Needs a core/sim plan first (surface attach in `VesselDesign`).
2. **Asset provider**: a `PartModelProvider` that loads glTF (`visual.kind: 'model'`, `params.url`) with the procedural generator as fallback; texture compression (KTX2); bundle and loading budget. Plan 022 may need it first for catalogue icons.
3. **Engine states**: ignition flash and start-up ramp, shutdown fade, gimbal from the commanded attitude, multi-nozzle engines, mach-diamond polish, ground light cast by the plume on the pad and the vessel.
4. **Smoke and dust**: volumetric look (lit by the sun with soft shadows), wind drift, terrain-dependent dust colour, water spray over the ocean, engine trail that persists in the air column.
5. **Debris**: shards from the real part meshes (split geometry) instead of boxes, parts that tumble in the physics world visibly; wreckage that stays on the ground.
6. **Plasma**: bow-shock shape from the vessel silhouette, ionisation colours with speed, comms blackout hook for 021's HUD.
7. **Device tuning**: frame times on an M1/M2 and an integrated Intel GPU for the part and effect budgets; tune the presets.

**Out:** environment (025), HUD (021), VAB (022).

## Steps

1. Refine: pick and order the items above with the human; one ADR per item that changes a boundary.

## Acceptance criteria

- [ ] To be written at refinement; every visual item carries `[manual]` screenshots under `docs/journal/assets/` and a frame-time table.

## Docs checklist

- [ ] STATUS, journal, ADRs for boundary changes, `docs/research/three.md`.

## Log

- 2026-10-16 — Created as draft by the parts session (pushed out of plan 020).

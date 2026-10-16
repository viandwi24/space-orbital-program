---
id: 040
title: "Effects and assets 3: wreckage, plasma shape, trails, multi-nozzle engines, KTX2"
status: draft
owner: ""
depends: [033]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 040 — Effects and assets 3

## Goal

What plan 033 pushed out of the look: debris that stays, a plasma shape that follows the vessel, a trail that persists in the air column, engines with more than one nozzle, compressed textures for asset parts.

## Context

- Read: `docs/journal/033-part-assets-effects-and-aero-follow-ups.md` (self-review, "Not done"), ADRs 0021, 0023, 0028, 0047, `docs/product/visual-direction.md`.

## Scope

**In (candidates, to be ordered at refinement), each with the reason it was not in 033:**
1. **Wreckage on the ground and tumbling booster stubs**: needs ADR 0021's debris lifecycle changed in the sim (debris is removed after `DEBRIS_REST_TIME`; the renderer cannot keep what the sim deleted).
2. **Plasma bow-shock shape from the vessel silhouette**: the shell is still a sphere sized by the lateral extent; projecting the silhouette each frame has a cost to budget against plan 039.
3. **Comms blackout hook**: needs a communications system the game does not have; a module event plus a HUD effect once one exists.
4. **Persistent engine trail in the air column**: a ribbon or volumetric system with the same budget questions as clouds (037).
5. **Multi-nozzle engines and mach-diamond polish**: geometry and art work that needs real models from the asset path to be judged.
6. **KTX2 textures and a loading budget** for `GltfPartProvider`: no textured asset exists to size a budget against; attach `KTX2Loader` to the provider's loader when one does.
7. **M1/M2 and integrated Intel frame times** (also in 038): no such hardware was available to the sessions so far.

## Steps

1. Refine: pick and order, one ADR per item that changes a boundary (1 changes the debris ADR).

## Acceptance criteria

- [ ] To be written at refinement; every visual item carries `[manual]` screenshots under `docs/journal/assets/` and a frame-time table (pad scene not slower than before).

## Docs checklist

- [ ] STATUS, journal, ADRs, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by the control session (pushed out of plan 033).

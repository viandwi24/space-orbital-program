# 0224 — Per-part design settings, module mass and shells, thrown-off debris, per-instance visuals

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/219-procedural-fairings.md
**Builds on:** ADR 0207 point 10 (procedural fairings), ADR 0203 (per-part settings), ADR 0016 and 0071 (design format), ADR 0018 (one body per vessel), ADR 0021 (debris), ADR 0028 (part visuals)

## Context

A fairing's shell is different on every part: its sections are built in the Hangar. The design format had no per-part data. Part mass came only from the definition and the contents. A part could leave a vessel only by a cut at a node. Part models were cached per definition. Plan 218 was to bring the settings field, but plan 219 comes first.

## Decision

1. **Per-part settings in the design:** `parts[].settings`, by module id, fields merged over the definition's module config and parsed by the module's schema at load. The field is additive in any format version, so there is no format bump. The Hangar writes it with `setPartSettings` (one undo step).
2. **Module mass:** `ModuleDefinition.mass(config, state)` adds kg to the part (`partMass`), so a fairing shell weighs while it is on.
3. **Shells:** `ModuleDefinition.shell(config, state)` gives a closed profile (`{ y, r }` bottom to top, part frame).
   - Every part of the vessel whose collider outline lies inside it takes no drag and no convective heat. The outline is a box's corners or eight points on each rim of a cylinder.
   - The shell's part then meets the air as a cylinder of the shell's widest radius and full height, nose open to the wind, with Cd 0.12 (a nose cone's).
4. **Thrown-off debris:** `VesselApi.spawnDebris({ part, settings, offset, velocity })` queues a one-part vessel.
   - After the step's splits it is spawned in the source part's frame at the source's pose plus the offset, moving at the source's velocity plus the push.
   - The mass must leave the source through a `mass` hook that drops, so pushes that cancel conserve momentum.
5. **Per-instance visuals:** `PartVisual.paramsFrom` names a module; its config's fields become generator params for that one model. In the Hangar they are the design settings over the definition; in flight they are the module snapshot. Lists go as JSON text.
   - The model factory keys its templates by those params.
   - A `visible` articulation hides the moving piece on an explicit false.
6. **`catalog.hidden`** keeps a debris-only part (the fairing panel) out of the catalogue.
7. **Stock fairing (starting values, journal-noted):**
   - bases of 0.625, 1.25 and 2.5 m;
   - sections tapered at most 30° each, radius 0.3 m to twice the base radius, 15 m tall at most;
   - a closed nose as tall as the last radius;
   - 4 kg/m² of shell;
   - 300 N·s outward on each of two panels (the plan's 1500 would throw ~23 kg panels at 65 m/s).

## Deferred

- The interstage (a top node at the shell's top and an enclosed engine) needs nodes that follow the settings. Today's nodes are the definition's.
- 3D drag handles on the sections, and a section added at the cursor's height: a click adds a half-metre section as wide as the last, and number fields set both values.
- A cost on the status label: the part's cost is the base's; the shell adds none yet.

## Consequences

- API_VERSION 0.1.81 (additive).
- Plan 218's inspector can write other settings through the same field: the thrust limiter of plan 210 is the next.

# 0238 — Interstage fairings: a node at the shell top, shielding while open, handles and a cost

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/243-interstage-fairings-handles.md
**Builds on:** ADR 0224 (per-part settings, shells, thrown-off debris; its "Deferred" list), ADR 0212 (node sizes), ADR 0235 (the Hangar pointer)

## Context

A fairing base had stack nodes at its own height only; the shell was edited with number fields and a click that added a fixed half metre; the shell added mass but no cost.

## Decision

1. **A node that follows the settings.** An attach node may carry `shellTop: "<module id>"`. `effectiveDef(def, settings)` (core) gives the definition as one design entry has it: the node sits at the module's `baseTop` plus the section heights, as wide as the last section, and exists only while the module's `interstage` setting is on and the shell has a section. `resolveVesselDesign` validates and places with it, so a stage on the node moves when a section changes; the Hangar (`attachTargets`, `freeNodes`, markers, size checks) uses it too. Raw definitions keep a static `interstage` node at the base top; only the effective one is true. API 0.1.93, additive.
2. **The fairing's `interstage` setting.** The base keeps its `top` node (inside the shell) and gains `interstage` (the next stage). Parts on `top` are inside the shell; parts on `interstage` carry on above it. An interstage is open at the top (no nose) and excludes `closed`. Turning it off is refused while a part hangs on its node; removing the last section while one does is refused by the design check.
3. **Shielding.** `shell()` returns the profile for a closed shell or an interstage, so every part whose collider lies inside takes no drag and no convective heat, as for a closed one. The shell's own part treats its top as covered when a part hangs on its shell-top node (no open nose to the wind).
4. **Jettison.** The panels leave as before. The base stays on the lower stage and the upper stage stays on its node; the player separates the stages with a decoupler as usual (stage separation stays a decoupler's job).
5. **Cost.** `ModuleDefinition.cost(config)` adds funds to the part for its config, over the entry's settings; the fairing's is its shell mass at the structure rate. `designCost` (so the Hangar strip, the launch price and the sim's charge) includes it, and the fairing panel's status label shows it.
6. **Handles in 3D.** While editing a fairing: a ring `hb` at the base rim (the plane's anchor), `h<i>` at each section top on the axis (drag up or down for the height) and `r<i>` on its rim (drag out or in for the radius). Handles are picked by screen distance (28 px), dragged on the vertical plane through the base facing the camera, previewed live and committed on release as one undo step; a value outside the limits keeps the last fit and shows the reason. Not offered for a tilted base.
7. **A section at the cursor.** A click on the shell in edit mode cuts the section it meets in two at that height with the corner on the line between its neighbours' radii (the shape does not change until a handle moves it); above the top it adds a section up to the cursor at the last radius. Within 0.1 m of a corner it is refused ("drag its handle instead").

## Consequences

Designs with an interstage need the new setting (additive; older files load unchanged). Cargo bays stay out of scope. A mod can mark its own shell-top node or sell module work through `cost`.

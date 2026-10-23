# 0315 — Hangar nested editing: outline selection, inside mode, a section cut, pick-through

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/378-hangar-nested-editing.md
**Builds on:** ADR 0297 (Hangar placement), plan 315 (seeing inside: hover x-ray, Show payload, Open), plan 356 (the orbiter bay)

## Context

The owner could not edit what sits inside a bay or a capsule (the Wayfarer Shuttle's keel and cargo bay, the LM inside Kronos V's SLA petals). The selected shell drew an additive fill and rim over its whole surface, so it painted over every part inside it. Clicks also hit the shell, not the parts inside, whenever the shell was not see-through at that moment (an open bay, or a selected shell with the pointer just off it).

## Decision

1. **Selection is a silhouette outline.** A selected (or hovered) part writes its footprint into the stencil buffer. An outline hull, expanded by a fixed number of pixels on screen, is drawn only outside that footprint. It is bright where in front, and dim where something stands before it. Nothing is drawn inside the part's footprint, so the parts inside stay clear. The selection is 3 px, hover 1.5 px, flags red. The Hangar's WebGL renderer and the composer's target get a stencil buffer. The shader is compiled at view start.
2. **Enclosed parts are picked first.** A shell that is see-through, open, or in inside mode lets the pointer reach the parts it holds. Only with nothing behind is the shell itself the pick (`reach` on `VabPart`).
3. **Inside mode.** A double click on an enclosing part (or on a part it holds), "Edit inside" on its card, or picking an enclosed part in the Parts list, enters the shell:
   - the shell turns to a faint veil (about 15 %) and cannot be picked;
   - the other parts dim;
   - the camera frames the shell;
   - only the shell's held parts and its nodes are picked;
   - a breadcrumb chip "Vessel › Shell" shows; Esc or the chip steps out.

   A pure state machine (`apps/web/src/lib/editor/inside-mode.ts`) handles enter, exit, deletion of the shell, and a selection outside it. It is unit-tested.
4. **A section cut.** A Section toggle cuts away the half of the vessel facing the camera, with a vertical plane through the vessel axis that turns with the camera. The plane is a local clipping plane shared by every part material from the moment the part is built. When the toggle is off, the plane lies far away, so turning the cut on or off never recompiles a shader.
5. **Pick-through by clicking again.** A second click on the same spot (within 6 px and 1.5 s) selects the next part behind, front to back. A small list of every part under the pointer shows next to it, and a click picks one (like the map pick list, plan 250). Alt+click stays the copy (plan 217). The pick order is a pure function, unit-tested.

## Consequences

- The outline needs normals. At hard edges the hull has small gaps, which are acceptable at 3 px.
- One more render state, the stencil, applies in the Hangar only. Flight is unchanged.
- The section cut also cuts the ghost and overlays: their materials take the same plane.
